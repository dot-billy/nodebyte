"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Trash2, Plus } from "lucide-react";

import { api, ApiError, type AdminTeamDetail, type AdminMemberRow, type AdminUserRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  mode: "create" | "detail";
  teamId?: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const ROLES = ["owner", "admin", "member", "viewer"] as const;

export function AdminTeamDialog({ mode, teamId, open, onClose, onSaved }: Props) {
  const [team, setTeam] = useState<AdminTeamDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  // Create mode: owner selection
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerResults, setOwnerResults] = useState<AdminUserRow[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<AdminUserRow | null>(null);
  const [searchingOwner, setSearchingOwner] = useState(false);

  // Add member
  const [showAddMember, setShowAddMember] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("member");
  const [addingMember, setAddingMember] = useState(false);

  const loadTeam = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const t = await api.admin.getTeam(teamId);
      setTeam(t);
      setName(t.name);
      setSlug(t.slug);
    } catch {
      setError("Failed to load team");
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setShowAddMember(false);
    if (mode === "detail" && teamId) {
      loadTeam();
    } else {
      setTeam(null);
      setName("");
      setSlug("");
      setSelectedOwner(null);
      setOwnerSearch("");
      setOwnerResults([]);
    }
  }, [open, mode, teamId, loadTeam]);

  async function searchOwners() {
    if (!ownerSearch.trim()) return;
    setSearchingOwner(true);
    try {
      const users = await api.admin.listUsers({ q: ownerSearch, limit: 5 });
      setOwnerResults(users);
    } catch { /* swallow */ }
    setSearchingOwner(false);
  }

  useEffect(() => {
    if (mode !== "create" || !ownerSearch.trim()) { setOwnerResults([]); return; }
    const t = setTimeout(searchOwners, 300);
    return () => clearTimeout(t);
  }, [ownerSearch, mode]);

  async function handleCreate() {
    if (!selectedOwner) { setError("Select an owner"); return; }
    setError("");
    setBusy(true);
    try {
      await api.admin.createTeam({ name, owner_user_id: selectedOwner.id });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create team");
    }
    setBusy(false);
  }

  async function handleUpdate() {
    if (!teamId || !team) return;
    setError("");
    setBusy(true);
    try {
      const data: Record<string, string> = {};
      if (name !== team.name) data.name = name;
      if (slug !== team.slug) data.slug = slug;
      if (Object.keys(data).length > 0) {
        await api.admin.updateTeam(teamId, data);
        await loadTeam();
        onSaved();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update team");
    }
    setBusy(false);
  }

  async function handleAddMember() {
    if (!teamId) return;
    setAddingMember(true);
    setError("");
    try {
      await api.admin.addMember(teamId, { email: addEmail, role: addRole });
      setShowAddMember(false);
      setAddEmail("");
      setAddRole("member");
      await loadTeam();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add member");
    }
    setAddingMember(false);
  }

  async function handleChangeRole(member: AdminMemberRow, newRole: string) {
    if (!teamId) return;
    try {
      await api.admin.updateMember(teamId, member.id, newRole);
      await loadTeam();
      onSaved();
    } catch { /* swallow */ }
  }

  async function handleRemoveMember(member: AdminMemberRow) {
    if (!teamId || !confirm(`Remove ${member.email} from this team?`)) return;
    try {
      await api.admin.removeMember(teamId, member.id);
      await loadTeam();
      onSaved();
    } catch { /* swallow */ }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl animate-slide-in-left">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4">
          <h2 className="text-lg font-semibold">
            {mode === "create" ? "Create Team" : "Team Details"}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[hsl(var(--muted))] transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
        ) : (
          <div className="space-y-5 p-6">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="admin-team-name">Team name</Label>
              <Input id="admin-team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Team" />
            </div>

            {mode === "detail" && (
              <div className="space-y-2">
                <Label htmlFor="admin-team-slug">Slug</Label>
                <Input id="admin-team-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-team" />
              </div>
            )}

            {mode === "create" && (
              <div className="space-y-2">
                <Label>Owner</Label>
                {selectedOwner ? (
                  <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                    <div>
                      <span className="text-sm font-medium">{selectedOwner.email}</span>
                      {selectedOwner.full_name && (
                        <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">{selectedOwner.full_name}</span>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedOwner(null); setOwnerSearch(""); }}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Input placeholder="Search users by email..." value={ownerSearch} onChange={(e) => setOwnerSearch(e.target.value)} />
                    {searchingOwner && <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Searching...</div>}
                    {ownerResults.length > 0 && (
                      <div className="mt-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
                        {ownerResults.map((u) => (
                          <button
                            key={u.id}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))] transition-colors"
                            onClick={() => { setSelectedOwner(u); setOwnerResults([]); }}
                          >
                            <span className="font-medium">{u.email}</span>
                            {u.full_name && <span className="text-xs text-[hsl(var(--muted-foreground))]">{u.full_name}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {mode === "detail" && team && (
              <>
                <div className="flex items-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
                  <span>Owner: <strong className="text-[hsl(var(--foreground))]">{team.owner_email ?? "—"}</strong></span>
                  <span>Nodes: <strong className="text-[hsl(var(--foreground))]">{team.node_count}</strong></span>
                </div>

                <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4 -mb-1">
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button onClick={handleUpdate} disabled={busy || (!name && !slug)}>
                    {busy && <Spinner className="mr-2 h-4 w-4" />}
                    Save Changes
                  </Button>
                </div>

                <div className="space-y-3 pt-2 border-t border-[hsl(var(--border))]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Members ({team.members.length})</h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowAddMember(!showAddMember)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add member
                    </Button>
                  </div>

                  {showAddMember && (
                    <div className="flex gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
                      <Input placeholder="user@example.com" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} className="flex-1" />
                      <select value={addRole} onChange={(e) => setAddRole(e.target.value)} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-sm">
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <Button size="sm" onClick={handleAddMember} disabled={addingMember || !addEmail}>
                        {addingMember ? <Spinner className="h-4 w-4" /> : "Add"}
                      </Button>
                    </div>
                  )}

                  {team.members.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">No members.</p>
                  ) : (
                    <div className="space-y-1">
                      {team.members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{m.email}</div>
                            {m.full_name && <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">{m.full_name}</div>}
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <select
                              value={m.role}
                              onChange={(e) => handleChangeRole(m, e.target.value)}
                              className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs"
                            >
                              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <button onClick={() => handleRemoveMember(m)} className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {mode === "create" && (
              <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleCreate} disabled={busy || !name || !selectedOwner}>
                  {busy && <Spinner className="mr-2 h-4 w-4" />}
                  Create Team
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
