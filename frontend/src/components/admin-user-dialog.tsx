"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Trash2, Plus } from "lucide-react";

import { api, ApiError, type AdminUserRow, type AdminTeamBrief } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  mode: "create" | "detail";
  userId?: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const ROLES = ["owner", "admin", "member", "viewer"] as const;

export function AdminUserDialog({ mode, userId, open, onClose, onSaved }: Props) {
  const [user, setUser] = useState<AdminUserRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [addTeamEmail, setAddTeamEmail] = useState("");
  const [addTeamRole, setAddTeamRole] = useState("member");
  const [addingTeam, setAddingTeam] = useState(false);
  const [showAddTeam, setShowAddTeam] = useState(false);

  const loadUser = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const u = await api.admin.getUser(userId);
      setUser(u);
      setEmail(u.email);
      setFullName(u.full_name ?? "");
      setIsSuperuser(u.is_superuser);
      setIsActive(u.is_active);
      setPassword("");
    } catch {
      setError("Failed to load user");
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (mode === "detail" && userId) {
      loadUser();
    } else {
      setUser(null);
      setEmail("");
      setFullName("");
      setPassword("");
      setIsSuperuser(false);
      setIsActive(true);
    }
  }, [open, mode, userId, loadUser]);

  async function handleCreate() {
    setError("");
    setBusy(true);
    try {
      await api.admin.createUser({ email, password, full_name: fullName || undefined, is_superuser: isSuperuser });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    }
    setBusy(false);
  }

  async function handleUpdate() {
    if (!userId) return;
    setError("");
    setBusy(true);
    try {
      const data: Record<string, unknown> = {};
      if (email !== user?.email) data.email = email;
      if ((fullName || null) !== (user?.full_name ?? null)) data.full_name = fullName || null;
      if (password) data.new_password = password;
      if (isSuperuser !== user?.is_superuser) data.is_superuser = isSuperuser;
      if (isActive !== user?.is_active) data.is_active = isActive;

      if (Object.keys(data).length > 0) {
        const updated = await api.admin.updateUser(userId, data as Parameters<typeof api.admin.updateUser>[1]);
        setUser(updated);
        setPassword("");
        onSaved();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user");
    }
    setBusy(false);
  }

  async function handleRemoveTeam(team: AdminTeamBrief) {
    if (!userId || !confirm(`Remove ${user?.email} from ${team.name}?`)) return;
    try {
      const detail = await api.admin.getTeam(team.id);
      const membership = detail.members.find((m) => m.user_id === userId);
      if (membership) {
        await api.admin.removeMember(team.id, membership.id);
        await loadUser();
        onSaved();
      }
    } catch { /* swallow */ }
  }

  async function handleAddToTeam() {
    if (!userId) return;
    setAddingTeam(true);
    try {
      const teams = await api.admin.listTeams({ q: addTeamEmail, limit: 10 });
      if (teams.length === 0) {
        setError("No team found matching that name");
        setAddingTeam(false);
        return;
      }
      await api.admin.addMember(teams[0].id, { email: user?.email ?? "", role: addTeamRole });
      setShowAddTeam(false);
      setAddTeamEmail("");
      setAddTeamRole("member");
      await loadUser();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add to team");
    }
    setAddingTeam(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl animate-slide-in-left">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4">
          <h2 className="text-lg font-semibold">
            {mode === "create" ? "Create User" : "User Details"}
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
              <Label htmlFor="admin-user-email">Email</Label>
              <Input id="admin-user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-user-name">Full name</Label>
              <Input id="admin-user-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-user-pw">{mode === "create" ? "Password" : "New password (leave blank to keep)"}</Label>
              <Input id="admin-user-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "create" ? "Min. 8 characters" : "••••••••"} minLength={8} />
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isSuperuser} onChange={(e) => setIsSuperuser(e.target.checked)} className="rounded" />
                Superuser
              </label>
              {mode === "detail" && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                  Active
                </label>
              )}
            </div>

            {mode === "detail" && user && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Team Memberships</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddTeam(!showAddTeam)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add to team
                  </Button>
                </div>

                {showAddTeam && (
                  <div className="flex gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
                    <Input placeholder="Team name..." value={addTeamEmail} onChange={(e) => setAddTeamEmail(e.target.value)} className="flex-1" />
                    <select value={addTeamRole} onChange={(e) => setAddTeamRole(e.target.value)} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-sm">
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <Button size="sm" onClick={handleAddToTeam} disabled={addingTeam || !addTeamEmail}>
                      {addingTeam ? <Spinner className="h-4 w-4" /> : "Add"}
                    </Button>
                  </div>
                )}

                {user.teams.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">Not a member of any team.</p>
                ) : (
                  <div className="space-y-2">
                    {user.teams.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                        <div>
                          <span className="text-sm font-medium">{t.name}</span>
                          <Badge variant="outline" className="ml-2 text-xs">{t.role}</Badge>
                        </div>
                        <button onClick={() => handleRemoveTeam(t)} className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={mode === "create" ? handleCreate : handleUpdate} disabled={busy || (mode === "create" && (!email || password.length < 8))}>
                {busy && <Spinner className="mr-2 h-4 w-4" />}
                {mode === "create" ? "Create User" : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
