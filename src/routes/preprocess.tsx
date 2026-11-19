import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, resolveUrl } from "@/lib/api";
import { pageHead } from "@/lib/seo";
import type { PreprocessResponse } from "@/lib/types";
import { FileDrop, SectionCard, chartTooltip } from "@/components/crowd/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/preprocess")({
  head: pageHead("Preprocessing Viewer", "See each preprocessing step: resize, grayscale and histogram equalisation."),
  component: PreprocessPage,
});

const STEPS = [
  ["original", "Original", "Raw input frame"],
  ["resized", "Resized", "224 × 224 network input"],
  ["grayscale", "Grayscale", "Luma: 0.299R + 0.587G + 0.114B"],
  ["equalized", "Histogram equalised", "Contrast spread via CDF mapping"],
] as const;

function PreprocessPage() {
  const [data, setData] = useState<PreprocessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (f: File) => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.preprocess(f));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <FileDrop accept={["jpg", "jpeg", "png", "bmp"]} label="Upload an image to preprocess" onFile={run} />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  const hist = data ? data.histograms.original.map((v, i) => ({ i, before: v, after: data.histograms.equalized[i] })) : [];

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><Button variant="outline" onClick={() => setData(null)}><RotateCcw /> New image</Button></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map(([key, title, desc], i) => (
          <div key={key} className="relative">
            <SectionCard title={<span><span className="mr-2 font-mono text-primary">0{i + 1}</span>{title}</span>}>
              {data ? <img src={resolveUrl(data[key])} alt={title} className="aspect-square w-full rounded-md object-cover" /> : <Skeleton className="aspect-square w-full" />}
              <p className="mt-3 text-xs text-muted-foreground">{desc}</p>
            </SectionCard>
            {i < 3 && <ArrowRight className="absolute -right-3.5 top-1/2 z-10 hidden size-5 text-primary xl:block" />}
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {(["before", "after"] as const).map((k) => (
          <SectionCard key={k} title={k === "before" ? "Histogram · grayscale (before)" : "Histogram · equalised (after)"}>
            <div className="h-56">
              {data ? (
                <ResponsiveContainer>
                  <AreaChart data={hist}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="i" stroke="var(--muted-foreground)" fontSize={11} ticks={[0, 64, 128, 192, 255]} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} width={40} />
                    <Tooltip {...chartTooltip} />
                    <Area dataKey={k} type="step" stroke={k === "before" ? "var(--chart-3)" : "var(--primary)"} fill={k === "before" ? "var(--chart-3)" : "var(--primary)"} fillOpacity={0.3} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Skeleton className="h-full" />
              )}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
