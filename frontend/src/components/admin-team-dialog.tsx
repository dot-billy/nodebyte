"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Trash2, Plus, Users, Hash } from "lucide-react";

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

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  member: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function AdminTeamDialog({ mode, teamId, open, onClose, onSaved }: Props) {
  const [team, setTeam] = useState<AdminTeamDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerResults, setOwnerResults] = useState<AdminUserRow[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<AdminUserRow | null>(null);
  const [searchingOwner, setSearchingOwner] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative z-50 flex w-full max-w-2xl flex-col max-h-[90vh] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl animate-slide-in-left">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              {mode === "create" ? "Create Team" : "Edit Team"}
            </h2>
            {mode === "detail" && team && (
              <div className="mt-0.5 flex items-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
                <span>{team.name}</span>
                <span className="text-[hsl(var(--border))]">·</span>
                <span>{team.node_count} node{team.node_count !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-2 hover:bg-[hsl(var(--muted))] transition-colors">
            <X className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
          ) : (
            <div className="divide-y divide-[hsl(var(--border))]">

              {error && (
                <div className="px-6 pt-4">
                  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
                    {error}
                  </div>
                </div>
              )}

              {/* Team Info Section */}
              <div className="space-y-4 px-6 py-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Team Info</h3>
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-team-name" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      <span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> Team name</span>
                    </Label>
                    <Input id="admin-team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Team" />
                  </div>

                  {mode === "detail" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-team-slug" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        <span className="flex items-center gap-1.5"><Hash className="h-3 w-3" /> Slug</span>
                      </Label>
                      <Input id="admin-team-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-team" className="font-mono text-sm" />
                    </div>
                  )}

                  {mode === "detail" && team && (
                    <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm">
                      <span className="text-[hsl(var(--muted-foreground))]">Owner</span>
                      <span className="font-medium">{team.owner_email ?? "—"}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Owner Selection (create mode) */}
              {mode === "create" && (
                <div className="space-y-3 px-6 py-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Owner</h3>
                  {selectedOwner ? (
                    <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
                      <div>
                        <div className="text-sm font-medium">{selectedOwner.email}</div>
                        {selectedOwner.full_name && (
                          <div className="text-xs text-[hsl(var(--muted-foreground))]">{selectedOwner.full_name}</div>
                        )}
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setSelectedOwner(null); setOwnerSearch(""); }}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Input placeholder="Search users by email..." value={ownerSearch} onChange={(e) => setOwnerSearch(e.target.value)} />
                      {searchingOwner && (
                        <div className="flex items-center gap-2 px-1 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                          <Spinner className="h-3 w-3" /> Searching...
                        </div>
                      )}
                      {ownerResults.length > 0 && (
                        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm overflow-hidden">
                          {ownerResults.map((u) => (
                            <button
                              key={u.id}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-[hsl(var(--muted))] transition-colors border-b border-[hsl(var(--border))] last:border-b-0"
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

              {/* Members Section (detail mode) */}
              {mode === "detail" && team && (
                <div className="space-y-3 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      Members ({team.members.length})
                    </h3>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowAddMember(!showAddMember)}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add member
                    </Button>
                  </div>

                  {showAddMember && (
                    <div className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 p-3">
                      <div className="flex gap-2">
                        <Input placeholder="user@example.com" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} className="flex-1 h-8 text-sm" />
                        <select value={addRole} onChange={(e) => setAddRole(e.target.value)} className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs">
                          {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                        </select>
                        <Button size="sm" className="h-8" onClick={handleAddMember} disabled={addingMember || !addEmail}>
                          {addingMember ? <Spinner className="h-3.5 w-3.5" /> : "Add"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {team.members.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-[hsl(var(--border))] py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
                      No members yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {team.members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{m.email}</div>
                            {m.full_name && <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">{m.full_name}</div>}
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            <select
                              value={m.role}
                              onChange={(e) => handleChangeRole(m, e.target.value)}
                              className="h-7 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
                            >
                              {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                            </select>
                            <button onClick={() => handleRemoveMember(m)} className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] px-6 py-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={mode === "create" ? handleCreate : handleUpdate}
              disabled={busy || !name || (mode === "create" && !selectedOwner)}
            >
              {busy && <Spinner className="mr-2 h-4 w-4" />}
              {mode === "create" ? "Create Team" : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
