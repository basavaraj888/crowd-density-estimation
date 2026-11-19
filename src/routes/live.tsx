import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Play, Square, Users } from "lucide-react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { api, USE_MOCK } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { pageHead } from "@/lib/seo";
import { HeatmapCanvas, KpiCard, LevelBadge, SectionCard, SimFeed, ZoneGrid, chartTooltip } from "@/components/crowd/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/live")({
  head: pageHead("Live Monitoring", "Monitor a webcam, IP or RTSP camera with live counts, heatmap and zone grid."),
  component: LivePage,
});

type Src = "webcam" | "ip" | "rtsp";

function LivePage() {
  const { live, liveSeries, running, setRunning, settings } = useApp();
  const [source, setSource] = useState<Src>("webcam");
  const [url, setUrl] = useState(settings.source_url);
  const [cam, setCam] = useState<MediaStream | null>(null);
  const [opacity, setOpacity] = useState(0.5);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => setUrl(settings.source_url), [settings.source_url]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = cam;
  }, [cam]);
  useEffect(() => () => cam?.getTracks().forEach((t) => t.stop()), [cam]);

  const start = async () => {
    if (source === "webcam") {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        setCam(s);
      } catch {
        toast.info("Camera not available — showing the simulated feed instead.");
      }
    } else if (!url.trim()) {
      return toast.error(`Enter the ${source === "ip" ? "IP camera" : "RTSP"} URL first.`);
    } else if (USE_MOCK) {
      toast.info("Mock mode: the backend would pull this stream; showing the simulated feed.");
    }
    setRunning(true);
  };
  const stop = () => {
    cam?.getTracks().forEach((t) => t.stop());
    setCam(null);
    setRunning(false);
  };

  const showMjpeg = !USE_MOCK && source !== "webcam" && running;

  return (
    <div className="space-y-6">
      <SectionCard title="Source">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Camera source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as Src)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="webcam">Webcam</SelectItem>
                <SelectItem value="ip">IP camera URL</SelectItem>
                <SelectItem value="rtsp">RTSP URL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {source !== "webcam" && (
            <div className="min-w-60 flex-1 space-y-1.5">
              <Label htmlFor="src-url">Stream URL</Label>
              <Input id="src-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={source === "ip" ? "http://192.168.1.20:8080/video" : "rtsp://192.168.1.20:554/stream1"} />
            </div>
          )}
          {running ? (
            <Button variant="destructive" onClick={stop}><Square /> Stop</Button>
          ) : (
            <Button onClick={start}><Play /> Start</Button>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Feed"
          className="xl:col-span-2"
          action={<div className="flex w-44 items-center gap-2 text-xs text-muted-foreground">Heatmap<Slider value={[opacity * 100]} onValueChange={([v]) => setOpacity(v / 100)} max={100} /></div>}
        >
          <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
            {cam ? (
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            ) : showMjpeg ? (
              <img src={api.mjpegUrl()} alt="Live MJPEG stream" className="h-full w-full object-cover" />
            ) : (
              <SimFeed points={live?.points ?? []} />
            )}
            {running && <HeatmapCanvas points={live?.points ?? []} opacity={opacity} />}
            {!running && <div className="absolute inset-0 grid place-items-center bg-background/70 text-sm text-muted-foreground">Stream stopped — press Start</div>}
            <span className="absolute left-2 top-2 rounded bg-background/70 px-2 py-0.5 font-mono text-[11px]">{cam ? "WEBCAM" : source === "webcam" ? "SIMULATED" : source.toUpperCase()}</span>
          </div>
        </SectionCard>
        <div className="space-y-4">
          <KpiCard label="Live count" value={live?.count ?? <Skeleton className="h-9 w-16" />} icon={<Users className="size-5" />} sub={live ? new Date(live.timestamp).toLocaleTimeString() : undefined} />
          <SectionCard title="Level">{live ? <LevelBadge level={live.level} className="text-base" /> : <Skeleton className="h-7 w-24" />}</SectionCard>
          <SectionCard title="Zones">{live ? <ZoneGrid zones={live.zones} /> : <Skeleton className="aspect-square" />}</SectionCard>
        </div>
      </div>

      <SectionCard title="Real-time count">
        <div className="h-60">
          <ResponsiveContainer>
            <LineChart data={liveSeries}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke="var(--muted-foreground)" fontSize={11} minTickGap={30} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} width={36} />
              <Tooltip {...chartTooltip} />
              <Line dataKey="count" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
  );
}
