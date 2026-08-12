"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCw, UserRound } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { api, ApiError, type AuditEventPage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function prettyAction(value: string) {
  return value.replaceAll(".", " · ").replaceAll("_", " ");
}

export default function ActivityPage() {
  const { activeTeam } = useAuth();
  const [page, setPage] = useState<AuditEventPage | null>(null);
  const [actorType, setActorType] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeTeam) return;
    setLoading(true);
    setError("");
    try {
      setPage(await api.accountability.auditEvents(activeTeam.id, {
        actor_type: actorType || undefined,
        resource_type: resourceType || undefined,
        limit: 100,
      }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load activity");
    } finally {
      setLoading(false);
    }
  }, [activeTeam, actorType, resourceType]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">An append-only history of human and automation changes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Actor type" value={actorType} onChange={(event) => setActorType(event.target.value)} className="h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
            <option value="">All actors</option><option value="user">People</option><option value="automation">Automation</option><option value="system">System</option>
          </select>
          <select aria-label="Resource type" value={resourceType} onChange={(event) => setResourceType(event.target.value)} className="h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
            <option value="">All resources</option><option value="node">Nodes</option><option value="node_batch">Node batches</option><option value="membership">Memberships</option><option value="registration_token">Registration tokens</option><option value="inventory_sync_run">Sync runs</option>
          </select>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh</Button>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}
      {loading ? <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div> : !page?.events.length ? (
        <div className="rounded-xl border border-dashed border-[hsl(var(--border))] py-16 text-center text-sm text-[hsl(var(--muted-foreground))]">No matching activity yet.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
          {page.events.map((event) => (
            <details key={event.id} className="group border-b border-[hsl(var(--border))] p-4 last:border-b-0">
              <summary className="flex cursor-pointer list-none items-start gap-3">
                <div className="mt-0.5 rounded-md bg-[hsl(var(--muted))] p-2">{event.actor_type === "automation" ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{event.resource_name || event.resource_type}</span><Badge variant="outline">{prettyAction(event.action)}</Badge></div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{event.actor_label || event.actor_type} · {new Date(event.created_at).toLocaleString()}</div>
                </div>
              </summary>
              <div className="mt-3 grid gap-3 pl-11 lg:grid-cols-2">
                {event.before_data && <div><div className="mb-1 text-xs font-medium">Before</div><pre className="max-h-64 overflow-auto rounded-md bg-[hsl(var(--muted))] p-3 text-xs">{JSON.stringify(event.before_data, null, 2)}</pre></div>}
                {event.after_data && <div><div className="mb-1 text-xs font-medium">After</div><pre className="max-h-64 overflow-auto rounded-md bg-[hsl(var(--muted))] p-3 text-xs">{JSON.stringify(event.after_data, null, 2)}</pre></div>}
                {Object.keys(event.context).length > 0 && <div><div className="mb-1 text-xs font-medium">Context</div><pre className="max-h-64 overflow-auto rounded-md bg-[hsl(var(--muted))] p-3 text-xs">{JSON.stringify(event.context, null, 2)}</pre></div>}
              </div>
            </details>
          ))}
        </div>
      )}
      {page && <p className="text-xs text-[hsl(var(--muted-foreground))]">Showing {page.events.length} of {page.total} events.</p>}
    </div>
  );
}
