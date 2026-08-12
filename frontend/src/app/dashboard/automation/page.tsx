"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, RadioTower } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { api, ApiError, type InventorySourcePublic, type InventorySyncRunPublic, type InventorySyncRunDetail } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

const HEALTH = {
  healthy: { label: "Healthy", icon: CheckCircle2, className: "text-green-700 dark:text-green-300" },
  stale: { label: "Stale", icon: Clock3, className: "text-amber-700 dark:text-amber-300" },
  failing: { label: "Failing", icon: AlertTriangle, className: "text-red-700 dark:text-red-300" },
  never: { label: "Never synced", icon: RadioTower, className: "text-[hsl(var(--muted-foreground))]" },
} as const;

export default function AutomationPage() {
  const { activeTeam } = useAuth();
  const [sources, setSources] = useState<InventorySourcePublic[]>([]);
  const [selected, setSelected] = useState<InventorySourcePublic | null>(null);
  const [runs, setRuns] = useState<InventorySyncRunPublic[]>([]);
  const [review, setReview] = useState<InventorySyncRunDetail | null>(null);
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeTeam) return;
    setLoading(true); setError("");
    try {
      const result = await api.accountability.sources(activeTeam.id);
      setSources(result.sources);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load automation health");
    } finally { setLoading(false); }
  }, [activeTeam]);

  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  async function choose(source: InventorySourcePublic) {
    if (!activeTeam) return;
    setSelected(source); setRuns([]);
    try { setRuns(await api.accountability.sourceRuns(activeTeam.id, source.id)); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Could not load sync runs"); }
  }

  async function reviewRun(run: InventorySyncRunPublic) {
    if (!activeTeam) return;
    try { setReview(await api.accountability.syncRun(activeTeam.id, run.id)); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Could not load sync preview"); }
  }

  async function applyRun(retireMissing: boolean) {
    if (!activeTeam || !review) return;
    setApplying(true); setError("");
    try {
      await api.accountability.applySyncRun(activeTeam.id, review.id, retireMissing);
      setReview(null);
      if (selected) setRuns(await api.accountability.sourceRuns(activeTeam.id, selected.id));
      const refreshed = await api.accountability.sources(activeTeam.id);
      setSources(refreshed.sources);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not apply sync preview"); }
    finally { setApplying(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">Automation health</h1><p className="text-sm text-[hsl(var(--muted-foreground))]">Know whether authoritative inventory sources are current and what each run changed.</p></div><Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh</Button></div>
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}
      {loading ? <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div> : !sources.length ? <div className="rounded-xl border border-dashed border-[hsl(var(--border))] py-16 text-center"><RadioTower className="mx-auto mb-3 h-8 w-8 text-[hsl(var(--muted-foreground))]" /><p className="font-medium">No managed inventory sources yet.</p><p className="text-sm text-[hsl(var(--muted-foreground))]">Run an updated Docker, Kubernetes, or LXD collector to create one.</p></div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{sources.map((source) => { const state = HEALTH[source.health_status]; const Icon = state.icon; return <Card key={source.id} className={`cursor-pointer transition-shadow hover:shadow-md ${selected?.id === source.id ? "ring-2 ring-[hsl(var(--primary))]" : ""}`}><button className="w-full text-left" onClick={() => choose(source)}><CardContent className="space-y-3 pt-5"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{source.name}</div><div className="text-xs text-[hsl(var(--muted-foreground))]">{source.source_key}</div></div><Badge variant="outline">{source.source_type}</Badge></div><div className={`flex items-center gap-2 text-sm font-medium ${state.className}`}><Icon className="h-4 w-4" />{state.label}</div><div className="text-xs text-[hsl(var(--muted-foreground))]">Last success: {source.last_success_at ? new Date(source.last_success_at).toLocaleString() : "Never"}</div>{source.last_error && <div className="rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{source.last_error}</div>}</CardContent></button></Card>; })}</div>}
      {selected && <div className="space-y-3"><h2 className="text-lg font-semibold">Recent runs · {selected.name}</h2><div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[hsl(var(--muted))]"><tr><th className="px-4 py-3 text-left">Time</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Created</th><th className="px-4 py-3 text-left">Updated</th><th className="px-4 py-3 text-left">Missing</th><th className="px-4 py-3 text-left">Retired</th><th className="px-4 py-3 text-left"></th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} className="border-t border-[hsl(var(--border))]"><td className="px-4 py-3">{new Date(run.created_at).toLocaleString()}</td><td className="px-4 py-3"><Badge variant="outline">{run.status}</Badge></td><td className="px-4 py-3">{String(run.summary.created ?? run.summary.create ?? 0)}</td><td className="px-4 py-3">{String(run.summary.updated ?? run.summary.update ?? 0)}</td><td className="px-4 py-3">{String(run.summary.missing ?? 0)}</td><td className="px-4 py-3">{String(run.summary.retired ?? 0)}</td><td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => reviewRun(run)}>Review</Button></td></tr>)}</tbody></table>{!runs.length && <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No sync runs found.</div>}</div></div>}
      {review && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReview(null)}><div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-[hsl(var(--background))] p-6 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Sync preview · {review.source.name}</h2><p className="text-sm text-[hsl(var(--muted-foreground))]">Created {new Date(review.created_at).toLocaleString()}</p></div><Badge variant="outline">{review.status}</Badge></div><div className="mt-5 grid gap-2 sm:grid-cols-4">{(["create", "update", "unchanged", "missing"] as const).map((key) => <Card key={key}><CardContent className="pt-4"><div className="text-2xl font-semibold">{String(review.summary[key] ?? 0)}</div><div className="text-xs capitalize text-[hsl(var(--muted-foreground))]">{key}</div></CardContent></Card>)}</div><div className="mt-5 overflow-x-auto rounded-lg border border-[hsl(var(--border))]"><table className="w-full min-w-[640px] text-sm"><thead className="bg-[hsl(var(--muted))]"><tr><th className="px-3 py-2 text-left">Action</th><th className="px-3 py-2 text-left">Node</th><th className="px-3 py-2 text-left">Changed fields</th></tr></thead><tbody>{review.changes.map((change, index) => <tr key={`${change.action}-${change.node_id || change.external_id || index}`} className="border-t border-[hsl(var(--border))]"><td className="px-3 py-2"><Badge variant="outline">{change.action}</Badge></td><td className="px-3 py-2"><div className="font-medium">{change.name}</div><div className="text-xs text-[hsl(var(--muted-foreground))]">{change.hostname || change.external_id || "—"}</div></td><td className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">{change.changed_fields.join(", ") || "—"}</td></tr>)}</tbody></table></div><div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setReview(null)}>Close</Button>{review.status === "previewed" && (activeTeam?.my_role === "owner" || activeTeam?.my_role === "admin") && <><Button variant="outline" disabled={applying} onClick={() => applyRun(false)}>Apply, keep missing</Button><Button disabled={applying} onClick={() => applyRun(true)} className="bg-red-600 text-white hover:bg-red-700">Apply and retire missing</Button></>}</div></div></div>}
    </div>
  );
}
