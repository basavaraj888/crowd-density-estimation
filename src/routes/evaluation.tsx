import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { pageHead } from "@/lib/seo";
import { SectionCard, chartTooltip } from "@/components/crowd/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/evaluation")({
  head: pageHead("Model Evaluation", "Compare Classical SVM, MCNN and CSRNet on MAE, RMSE and speed."),
  component: EvalPage,
});

const DESC = {
  "Classical SVM": "Hand-crafted texture (GLCM/LBP) and edge features per patch regressed with an SVM. Fast and light, but struggles with occlusion and dense scenes.",
  MCNN: "Multi-column CNN (Zhang et al., 2016) with three columns of different receptive fields to handle varying head sizes; predicts a density map.",
  CSRNet: "VGG-16 front-end plus dilated convolution back-end (Li et al., 2018). Best accuracy on highly congested scenes at a higher compute cost.",
} as const;

function EvalPage() {
  const q = useQuery({ queryKey: ["metrics"], queryFn: api.metrics });
  if (q.isError)
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p>Couldn't load evaluation metrics.</p>
        <Button onClick={() => q.refetch()}>Retry</Button>
      </div>
    );
  const d = q.data;
  const best = d ? Math.min(...d.models.map((m) => m.mae)) : 0;
  const max = d ? Math.max(...d.scatter.flatMap((s) => [s.gt, s.pred])) : 0;
  return (
    <div className="space-y-6">
      <SectionCard title="Comparison (ShanghaiTech-style test set)">
        {!d ? <Skeleton className="h-40" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Model</TableHead><TableHead className="text-right">MAE ↓</TableHead><TableHead className="text-right">RMSE ↓</TableHead><TableHead className="text-right">FPS ↑</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.models.map((m) => (
                <TableRow key={m.name} className={m.mae === best ? "bg-primary/5" : ""}>
                  <TableCell className="font-medium">{m.name}{m.mae === best && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">BEST</span>}</TableCell>
                  <TableCell className="text-right font-mono">{m.mae}</TableCell>
                  <TableCell className="text-right font-mono">{m.rmse}</TableCell>
                  <TableCell className="text-right font-mono">{m.fps}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="MAE vs RMSE">
          <div className="h-72">
            {!d ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer>
                <BarChart data={d.models}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} width={36} />
                  <Tooltip {...chartTooltip} cursor={{ fill: "var(--muted)" }} />
                  <Legend />
                  <Bar dataKey="mae" name="MAE" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rmse" name="RMSE" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Predicted vs ground truth (CSRNet)">
          <div className="h-72">
            {!d ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer>
                <ScatterChart>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="gt" type="number" name="Ground truth" stroke="var(--muted-foreground)" fontSize={11} domain={[0, max]} />
                  <YAxis dataKey="pred" type="number" name="Predicted" stroke="var(--muted-foreground)" fontSize={11} width={40} domain={[0, max]} />
                  <Tooltip {...chartTooltip} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke="var(--level-medium)" strokeDasharray="5 5" label={{ value: "y = x", fill: "var(--muted-foreground)", position: "insideTopLeft" }} />
                  <Scatter data={d.scatter} fill="var(--primary)" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(DESC).map(([k, v]) => (
          <SectionCard key={k} title={k}><p className="text-sm text-muted-foreground">{v}</p></SectionCard>
        ))}
      </div>
    </div>
  );
}
