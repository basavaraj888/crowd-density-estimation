import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Download, Loader2, RotateCcw, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { api, resolveUrl } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { composeOverlay } from "@/lib/heatmap";
import { pageHead } from "@/lib/seo";
import type { PredictImageResponse } from "@/lib/types";
import { FileDrop, KpiCard, LevelBadge, SectionCard, ZoneGrid } from "@/components/crowd/primitives";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/image")({
  head: pageHead("Image Analysis", "Upload a crowd photo to get a head count, density heatmap and per-zone breakdown."),
  component: ImagePage,
});

function ImagePage() {
  const { settings, raiseAlert } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<PredictImageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.6);
  const [saved, setSaved] = useState(false);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const analyze = async (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setSaved(false);
    setError(null);
    setLoading(true);
    try {
      const r = await api.predictImage(f);
      setResult(r);
      if (r.level !== "Low") raiseAlert(r.level, r.count, "image");
    } catch (e) {
      setError((e as Error).message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!result || !file) return;
    await api.addHistory({ source: "image", filename: file.name, count: result.count, level: result.level, model: settings.model });
    setSaved(true);
    toast.success("Saved to history");
  };

  const download = async () => {
    if (!result || !preview) return;
    try {
      const url = await composeOverlay(preview, resolveUrl(result.density_map_url), opacity);
      const a = document.createElement("a");
      a.href = url;
      a.download = `overlay_${file?.name.replace(/\.\w+$/, "") ?? "image"}.jpg`;
      a.click();
    } catch {
      window.open(resolveUrl(result.overlay_url), "_blank");
    }
  };

  if (!preview) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <FileDrop accept={["jpg", "jpeg", "png", "bmp"]} label="Upload a crowd image" onFile={analyze} />
        <p className="text-center text-sm text-muted-foreground">The {settings.model} model will estimate the head count and generate a density map.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="truncate text-sm text-muted-foreground">File: <span className="text-foreground">{file?.name}</span></p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => (setPreview(null), setResult(null))}><RotateCcw /> New image</Button>
          <Button variant="outline" disabled={!result} onClick={download}><Download /> Download overlay</Button>
          <Button disabled={!result || saved} onClick={save}><Save /> {saved ? "Saved" : "Save to history"}</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Estimated count" value={result ? result.count : loading ? <Skeleton className="h-9 w-16" /> : "—"} icon={<Users className="size-5" />} />
        <KpiCard label="Crowd level" value={result ? <LevelBadge level={result.level} className="text-sm" /> : loading ? <Skeleton className="h-7 w-20" /> : "—"} icon={<Users className="size-5" />} />
        <KpiCard label="Processing time" value={result ? `${result.processing_ms} ms` : loading ? <Skeleton className="h-9 w-24" /> : "—"} icon={<Clock className="size-5" />} />
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => file && analyze(file)}>Retry</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Original">
          <img src={preview} alt="Uploaded crowd" className="w-full rounded-lg" />
        </SectionCard>
        <SectionCard
          title="Density heatmap overlay"
          action={
            <div className="flex w-44 items-center gap-2 text-xs text-muted-foreground">
              Opacity
              <Slider value={[opacity * 100]} onValueChange={([v]) => setOpacity(v / 100)} max={100} step={1} />
            </div>
          }
        >
          <div className="relative overflow-hidden rounded-lg">
            <img src={preview} alt="Crowd with density overlay" className="w-full" />
            {result && <img src={resolveUrl(result.density_map_url)} alt="" className="absolute inset-0 h-full w-full" style={{ opacity }} />}
            {loading && (
              <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
                <span className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Running {settings.model}…</span>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Per-zone counts">
        {result ? <ZoneGrid zones={result.zones} className="max-w-xl" /> : <Skeleton className="h-48 max-w-xl" />}
      </SectionCard>
    </div>
  );
}
