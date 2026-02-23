"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Trash2, Users, Server, Plus } from "lucide-react";

import { api, type AdminTeamRow } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AdminTeamDialog } from "@/components/admin-team-dialog";

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<AdminTeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "detail">("create");
  const [dialogTeamId, setDialogTeamId] = useState<string | undefined>();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .listTeams({ q: debouncedSearch || undefined, limit: 100 })
      .then(setTeams)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setDialogMode("create");
    setDialogTeamId(undefined);
    setDialogOpen(true);
  }

  function openDetail(teamId: string) {
    setDialogMode("detail");
    setDialogTeamId(teamId);
    setDialogOpen(true);
  }

  async function deleteTeam(t: AdminTeamRow) {
    if (!confirm(`Delete team "${t.name}" and all its data? This cannot be undone.`)) return;
    setBusy(t.id);
    try {
      await api.admin.deleteTeam(t.id);
      setTeams((prev) => prev.filter((x) => x.id !== t.id));
    } catch { /* swallow */ }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage all teams across the platform.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Create Team
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
        <Input
          placeholder="Search by name or slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      ) : teams.length === 0 ? (
        <p className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">No teams found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
          <table className="min-w-[640px] w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                <th className="px-4 py-3 text-left font-medium">Team</th>
                <th className="px-4 py-3 text-left font-medium">Owner</th>
                <th className="px-4 py-3 text-center font-medium">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Members</span>
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  <span className="inline-flex items-center gap-1"><Server className="h-3.5 w-3.5" /> Nodes</span>
                </th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted))]/50 transition-colors">
                  <td className="px-4 py-3 cursor-pointer" onClick={() => openDetail(t.id)}>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">{t.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {t.owner_email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center">{t.member_count}</td>
                  <td className="px-4 py-3 text-center">{t.node_count}</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => deleteTeam(t)}
                      disabled={busy === t.id}
                    >
                      {busy === t.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminTeamDialog
        mode={dialogMode}
        teamId={dialogTeamId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
