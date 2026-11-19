import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, BellRing, Gauge, TrendingUp, Users } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "@/lib/app-context";
import { pageHead } from "@/lib/seo";
import { EmptyState, HeatmapCanvas, KpiCard, LevelBadge, SectionCard, SimFeed, ZoneGrid, chartTooltip } from "@/components/crowd/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: pageHead("Dashboard", "Live crowd count, density level, zone hotspots and alert history at a glance."),
  component: Dashboard,
});

function Dashboard() {
  const { live, liveSeries, peak, avg, alerts, settings, running, setRunning } = useApp();
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Current count" value={live ? live.count : <Skeleton className="h-9 w-20" />} icon={<Users className="size-5" />} sub="people in frame" />
        <KpiCard label="Peak" value={peak} icon={<TrendingUp className="size-5" />} sub="since session start" />
        <KpiCard label="Average" value={avg} icon={<Gauge className="size-5" />} sub={`${liveSeries.length}s sampled`} />
        <KpiCard label="Crowd level" value={live ? <LevelBadge level={live.level} className="text-sm" /> : <Skeleton className="h-7 w-24" />} icon={<Activity className="size-5" />} sub={`Model: ${settings.model}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Live count · last 60 s" className="xl:col-span-2" action={<Button size="sm" variant="outline" onClick={() => setRunning(!running)}>{running ? "Pause" : "Resume"}</Button>}>
          <div className="h-72">
            {liveSeries.length < 2 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer>
                <LineChart data={liveSeries}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="t" stroke="var(--muted-foreground)" fontSize={11} minTickGap={30} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} width={36} />
                  <Tooltip {...chartTooltip} />
                  <ReferenceLine y={settings.medium_max} stroke="var(--level-medium)" strokeDasharray="4 4" />
                  <ReferenceLine y={settings.high_max} stroke="var(--level-critical)" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Live camera" action={<Link to="/live" className="text-xs text-primary hover:underline">Open monitor →</Link>}>
          <div className="relative aspect-video overflow-hidden rounded-lg border">
            <SimFeed points={live?.points ?? []} />
            <HeatmapCanvas points={live?.points ?? []} opacity={0.55} />
            <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-background/70 px-2 py-0.5 font-mono text-[11px]">
              <span className="size-1.5 animate-pulse rounded-full bg-level-critical" /> CAM-01
            </span>
            {live && <span className="absolute bottom-2 right-2 rounded bg-background/70 px-2 py-0.5 font-mono text-xs">{live.count} ppl</span>}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={`Zone density · ${settings.zone_grid}×${settings.zone_grid}`}>
          {live ? <ZoneGrid zones={live.zones} /> : <Skeleton className="aspect-video w-full" />}
        </SectionCard>
        <SectionCard title="Alert history" action={<BellRing className="size-4 text-muted-foreground" />}>
          {alerts.length === 0 ? (
            <EmptyState title="No alerts yet" hint={`You'll see an entry here when the count crosses ${settings.low_max}, ${settings.medium_max} or ${settings.high_max}.`} />
          ) : (
            <ul className="max-h-80 divide-y overflow-auto">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <LevelBadge level={a.level} />
                    <span className="font-mono">{a.count} people</span>
                    <span className="text-muted-foreground">· {a.source}</span>
                  </div>
                  <time className="text-xs text-muted-foreground">{new Date(a.at).toLocaleTimeString()}</time>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
