import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Film, Loader2, RotateCcw, Save, TrendingUp, Users, Gauge } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { api, resolveUrl } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { levelRank } from "@/lib/levels";
import { pageHead } from "@/lib/seo";
import type { PredictVideoResponse } from "@/lib/types";
import { EmptyState, FileDrop, KpiCard, LevelBadge, SectionCard, chartTooltip } from "@/components/crowd/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/video")({
  head: pageHead("Video Analysis", "Analyse recorded footage frame by frame with a synced density overlay and count timeline."),
  component: VideoPage,
});

function VideoPage() {
  const { settings, raiseAlert } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [frameSkip, setFrameSkip] = useState("5");
  const [result, setResult] = useState<PredictVideoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [opacity, setOpacity] = useState(0.55);
  const video = useRef<HTMLVideoElement>(null);
  const lastAlert = useRef(-1);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (video.current) setTime(video.current.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [url]);

  const current = useMemo(() => {
    if (!result?.frames.length) return null;
    let best = result.frames[0];
    for (const f of result.frames) if (f.t <= time) best = f;
    return best;
  }, [result, time]);

  useEffect(() => {
    if (!current || !video.current || video.current.paused) return;
    const r = levelRank(current.level);
    if (r >= 2 && r > lastAlert.current) raiseAlert(current.level, current.count, "video");
    lastAlert.current = r;
  }, [current, raiseAlert]);

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    lastAlert.current = -1;
    try {
      setResult(await api.predictVideo(file, Number(frameSkip)));
      toast.success("Video analysed — press play to watch the overlay");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!result || !file) return;
    const level = result.frames.reduce((m, f) => (levelRank(f.level) > levelRank(m) ? f.level : m), result.frames[0].level);
    await api.addHistory({ source: "video", filename: file.name, count: result.peak, level, model: settings.model });
    toast.success("Saved to history (peak count)");
  };

  const skipSelect = (
    <Select value={frameSkip} onValueChange={setFrameSkip}>
      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
      <SelectContent>
        {[1, 3, 5, 10, 15].map((n) => <SelectItem key={n} value={String(n)}>frame_skip = {n}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  if (!url) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <FileDrop accept={["mp4", "avi", "mov", "webm"]} label="Upload a crowd video" onFile={(f) => (setFile(f), setUrl(URL.createObjectURL(f)), setResult(null))} />
        <p className="text-center text-sm text-muted-foreground">Tip: AVI files may not play in every browser; MP4 or WebM work best.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto truncate text-sm text-muted-foreground">File: <span className="text-foreground">{file?.name}</span></p>
        {skipSelect}
        <Button onClick={analyze} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <Film />} {result ? "Re-analyse" : "Analyse video"}</Button>
        <Button variant="outline" disabled={!result} onClick={save}><Save /> Save</Button>
        <Button variant="outline" onClick={() => (setUrl(null), setFile(null), setResult(null))}><RotateCcw /> New video</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Player"
          className="xl:col-span-2"
          action={<div className="flex w-44 items-center gap-2 text-xs text-muted-foreground">Overlay<Slider value={[opacity * 100]} onValueChange={([v]) => setOpacity(v / 100)} max={100} /></div>}
        >
          <div className="relative overflow-hidden rounded-lg bg-muted">
            <video ref={video} src={url} controls className="w-full" onError={() => toast.error("Your browser can't play this video format. Try MP4 or WebM.")} />
            {current && <img src={resolveUrl(current.overlay_url)} alt="" className="pointer-events-none absolute inset-x-0 top-0 h-[calc(100%-48px)] w-full" style={{ opacity }} />}
            {current && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-background/75 px-3 py-1.5 backdrop-blur">
                <span className="font-mono text-lg font-semibold">{current.count}</span>
                <LevelBadge level={current.level} />
              </div>
            )}
            {loading && <div className="absolute inset-0 grid place-items-center bg-background/60"><span className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Processing frames…</span></div>}
          </div>
        </SectionCard>
        <div className="grid gap-4">
          <KpiCard label="Count now" value={current?.count ?? "—"} icon={<Users className="size-5" />} sub={`t = ${time.toFixed(1)} s`} />
          <KpiCard label="Peak" value={result?.peak ?? "—"} icon={<TrendingUp className="size-5" />} />
          <KpiCard label="Average" value={result?.avg ?? "—"} icon={<Gauge className="size-5" />} sub={result ? `${result.frames.length} frames sampled` : undefined} />
        </div>
      </div>

      <SectionCard title="Count vs time">
        {!result ? (
          <EmptyState title="No timeline yet" hint="Choose a frame_skip value and press “Analyse video”." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={result.frames} onClick={(e) => { const t = Number(e?.activeLabel); if (video.current && !isNaN(t)) video.current.currentTime = t; }}>
                <defs>
                  <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} stroke="var(--muted-foreground)" fontSize={11} unit="s" />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} width={36} />
                <Tooltip {...chartTooltip} />
                <ReferenceLine y={settings.high_max} stroke="var(--level-critical)" strokeDasharray="4 4" />
                <ReferenceLine x={current?.t} stroke="var(--foreground)" />
                <Area type="monotone" dataKey="count" stroke="var(--primary)" fill="url(#vg)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
