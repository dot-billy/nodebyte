"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, EyeOff, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, type MemberPublic, type StaleReviewQueue } from "@/lib/api";
import { useAuth } from "@/lib/auth";


function canReview(role: string | null | undefined) {
  return role === "owner" || role === "admin" || role === "member";
}


function lastSeenLabel(value: string | null) {
  if (!value) return "Never seen";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Seen today" : `${days} day${days === 1 ? "" : "s"} ago`;
}


export default function StaleInventoryReviewPage() {
  const { activeTeam } = useAuth();
  const [threshold, setThreshold] = useState(30);
  const [queue, setQueue] = useState<StaleReviewQueue | null>(null);
  const [members, setMembers] = useState<MemberPublic[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ownerUserId, setOwnerUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allowed = canReview(activeTeam?.my_role);

  const load = useCallback(async () => {
    if (!activeTeam) return;
    setLoading(true);
    setError("");
    try {
      const [reviewQueue, teamMembers] = await Promise.all([
        api.nodes.staleReview(activeTeam.id, threshold),
        api.members.list(activeTeam.id),
      ]);
      setQueue(reviewQueue);
      setMembers(teamMembers);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load stale inventory");
    } finally {
      setLoading(false);
    }
  }, [activeTeam, threshold]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const allSelected = useMemo(
    () => Boolean(queue?.nodes.length) && selected.size === queue?.nodes.length,
    [queue, selected]
  );

  function toggleNode(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function decide(status: "active" | "ignored" | "retired") {
    if (!activeTeam || selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      await api.nodes.decideStaleReview(activeTeam.id, {
        node_ids: [...selected],
        lifecycle_status: status,
        owner_user_id: ownerUserId || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save review decision");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stale inventory review</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Decide whether inactive nodes should remain active, be ignored, or be retired.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm" htmlFor="stale-threshold">Stale after</label>
          <select
            id="stale-threshold"
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
            className="h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {queue && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Needs review", queue.summary.pending],
            ["All stale", queue.summary.total_stale],
            ["Ignored", queue.summary.ignored],
            ["Retired", queue.summary.retired],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent className="pt-5">
                <div className="text-2xl font-semibold">{value}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

      {selected.size > 0 && allowed && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <select
            value={ownerUserId}
            onChange={(event) => setOwnerUserId(event.target.value)}
            className="h-9 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          >
            <option value="">Keep current owner</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>{member.full_name || member.email}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("active")}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Keep active
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("ignored")}>
            <EyeOff className="mr-1.5 h-4 w-4" /> Ignore
          </Button>
          <Button size="sm" disabled={busy} onClick={() => decide("retired")} className="bg-red-600 text-white hover:bg-red-700">
            <Archive className="mr-1.5 h-4 w-4" /> Retire
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      ) : !queue?.nodes.length ? (
        <div className="rounded-xl border border-dashed border-[hsl(var(--border))] py-16 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-green-600" />
          <p className="font-medium">The stale review queue is clear.</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Reviewed nodes return only after another stale interval or a new activity cycle.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[hsl(var(--muted))]">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all stale nodes"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(queue.nodes.map((node) => node.id)))}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">Node</th>
                <th className="px-4 py-3 text-left font-medium">Kind</th>
                <th className="px-4 py-3 text-left font-medium">Last seen</th>
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Owner</th>
              </tr>
            </thead>
            <tbody>
              {queue.nodes.map((node) => (
                <tr key={node.id} className="border-t border-[hsl(var(--border))]">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${node.name}`}
                      checked={selected.has(node.id)}
                      onChange={() => toggleNode(node.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{node.name}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">{node.hostname || node.ip || "No hostname"}</div>
                  </td>
                  <td className="px-4 py-3"><Badge variant="outline">{node.kind}</Badge></td>
                  <td className="px-4 py-3 font-medium text-amber-700 dark:text-amber-300">{lastSeenLabel(node.last_seen_at)}</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{node.last_seen_source || "—"}</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{node.owner_email || "Unassigned"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
