import { useEffect, useRef, useState, type ReactNode } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { drawDensity } from "@/lib/heatmap";
import type { Level, Point } from "@/lib/types";
import { Card } from "@/components/ui/card";

const levelStyles: Record<Level, string> = {
  Low: "bg-level-low/15 text-level-low border-level-low/40",
  Medium: "bg-level-medium/15 text-level-medium border-level-medium/40",
  High: "bg-level-high/15 text-level-high border-level-high/40",
  Critical: "bg-level-critical/20 text-level-critical border-level-critical/60 animate-pulse-critical",
};
const dotStyles: Record<Level, string> = {
  Low: "bg-level-low",
  Medium: "bg-level-medium",
  High: "bg-level-high",
  Critical: "bg-level-critical",
};

export function LevelBadge({ level, className }: { level: Level; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", levelStyles[level], className)}>
      <span className={cn("size-1.5 rounded-full", dotStyles[level])} />
      {level}
    </span>
  );
}

export function KpiCard({ label, value, icon, sub, className }: { label: string; value: ReactNode; icon: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <Card className={cn("relative overflow-hidden p-5 animate-rise", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">{value}</div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary">{icon}</div>
      </div>
    </Card>
  );
}

export function ZoneGrid({ zones, className }: { zones: number[][]; className?: string }) {
  const n = zones.length;
  if (!n) return <EmptyState title="No zone data yet" />;
  const flat = zones.flat();
  const max = Math.max(1, ...flat);
  const hot = flat.indexOf(Math.max(...flat));
  return (
    <div className={cn("grid gap-1.5", className)} style={{ gridTemplateColumns: `repeat(${zones[0]?.length ?? n}, minmax(0, 1fr))` }}>
      {zones.map((row, r) =>
        row.map((v, c) => {
          const idx = r * row.length + c;
          const pct = Math.round((v / max) * 85);
          return (
            <div
              key={idx}
              className={cn(
                "relative flex aspect-[4/3] flex-col items-center justify-center rounded-md border text-center transition-colors duration-500",
                idx === hot && v > 0 && "ring-2 ring-level-critical",
              )}
              style={{ background: `color-mix(in oklab, var(--level-critical) ${pct}%, var(--muted))` }}
            >
              <span className="font-mono text-lg font-semibold tabular-nums">{v}</span>
              <span className="text-[10px] uppercase tracking-wide text-foreground/70">Z{r + 1}-{c + 1}</span>
              {idx === hot && v > 0 && <span className="absolute right-1 top-1 rounded bg-level-critical px-1 text-[9px] font-bold text-destructive-foreground">HOT</span>}
            </div>
          );
        }),
      )}
    </div>
  );
}

/** Transparent density layer meant to be placed over an image/video. */
export function HeatmapCanvas({ points, opacity = 0.6, className }: { points: Point[]; opacity?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawDensity(ref.current, points, 192, 108);
  }, [points]);
  return <canvas ref={ref} className={cn("pointer-events-none absolute inset-0 h-full w-full transition-opacity", className)} style={{ opacity }} />;
}

/** Generated "camera" scene used when no real feed is available. */
export function SimFeed({ points, className }: { points: Point[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pts = useRef(points);
  pts.current = points;
  useEffect(() => {
    let raf = 0;
    const draw = (time: number) => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext("2d")!;
      const w = (c.width = 640);
      const h = (c.height = 360);
      const css = getComputedStyle(c);
      const bg = css.getPropertyValue("--card").trim() || "#1e2533";
      const line = css.getPropertyValue("--border").trim() || "#334";
      const fg = css.getPropertyValue("--muted-foreground").trim() || "#aab";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 12; i++) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + (i - 6) * 12, h * 0.05);
        ctx.lineTo(w / 2 + (i - 6) * 110, h);
        ctx.stroke();
      }
      for (let j = 1; j < 8; j++) {
        const y = h * 0.05 + (h * 0.95 * j * j) / 49;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.fillStyle = fg;
      for (const p of pts.current) {
        const s = 2 + p.y * 5;
        const x = p.x * w;
        const y = p.y * h;
        ctx.beginPath();
        ctx.arc(x, y - s * 1.6, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - s * 0.45, y - s, s * 0.9, s * 1.6);
      }
      const scan = (time / 12) % h;
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0, scan, w, 3);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className={cn("h-full w-full object-cover", className)} />;
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

const MAX_MB = 100;
export function FileDrop({ accept, label, onFile, disabled }: { accept: string[]; label: string; onFile: (f: File) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const handle = (f?: File) => {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!accept.includes(ext)) return setError(`"${f.name}" isn't supported. Please use ${accept.map((a) => a.toUpperCase()).join(", ")}.`);
    if (f.size > MAX_MB * 1024 * 1024) return setError(`That file is ${(f.size / 1048576).toFixed(0)} MB — the limit is ${MAX_MB} MB.`);
    setError(null);
    onFile(f);
  };
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files[0]);
        }}
        className={cn(
          "grid-bg flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all hover:border-primary/60 disabled:opacity-50",
          over && "border-primary bg-primary/5 shadow-glow",
        )}
      >
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <UploadCloud className="size-6" />
        </div>
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            Drag & drop or click to browse · {accept.map((a) => a.toUpperCase()).join(", ")} · up to {MAX_MB} MB
          </p>
        </div>
      </button>
      <input ref={input} type="file" hidden accept={accept.map((a) => `.${a}`).join(",")} onChange={(e) => (handle(e.target.files?.[0]), (e.target.value = ""))} />
      {error && <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function SectionCard({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5 animate-rise", className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

export const chartTooltip = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" },
  labelStyle: { color: "var(--muted-foreground)" },
};
