"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Trash2, Plus, Shield, ShieldOff, UserCheck, UserX } from "lucide-react";

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

function Toggle({ checked, onChange, label, activeColor = "bg-emerald-500", icon }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  activeColor?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] px-4 py-3 text-left transition-colors hover:bg-[hsl(var(--muted))] w-full"
    >
      {icon}
      <span className="flex-1 text-sm font-medium">{label}</span>
      <div className={`relative h-6 w-11 rounded-full transition-colors ${checked ? activeColor : "bg-[hsl(var(--muted))]"}`}>
        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </div>
    </button>
  );
}

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

  const [addTeamName, setAddTeamName] = useState("");
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
    setShowAddTeam(false);
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
    setError("");
    try {
      const teams = await api.admin.listTeams({ q: addTeamName, limit: 10 });
      if (teams.length === 0) {
        setError("No team found matching that name");
        setAddingTeam(false);
        return;
      }
      await api.admin.addMember(teams[0].id, { email: user?.email ?? "", role: addTeamRole });
      setShowAddTeam(false);
      setAddTeamName("");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative z-50 flex w-full max-w-lg flex-col max-h-[90vh] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl animate-slide-in-left">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              {mode === "create" ? "Create User" : "Edit User"}
            </h2>
            {mode === "detail" && user && (
              <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{user.email}</p>
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

              {/* Profile Section */}
              <div className="space-y-4 px-6 py-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Profile</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="admin-user-email" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Email</Label>
                    <Input id="admin-user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="admin-user-name" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Full name</Label>
                    <Input id="admin-user-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="admin-user-pw" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      {mode === "create" ? "Password" : "Reset password"}
                    </Label>
                    <Input id="admin-user-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "create" ? "Min. 8 characters" : "Leave blank to keep current"} minLength={8} />
                  </div>
                </div>
              </div>

              {/* Account Flags Section */}
              <div className="space-y-3 px-6 py-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Account</h3>
                <div className="space-y-2">
                  <Toggle
                    checked={isSuperuser}
                    onChange={setIsSuperuser}
                    label="Superuser"
                    activeColor="bg-amber-500"
                    icon={isSuperuser ? <Shield className="h-4 w-4 text-amber-500" /> : <ShieldOff className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />}
                  />
                  {mode === "detail" && (
                    <Toggle
                      checked={isActive}
                      onChange={setIsActive}
                      label="Active"
                      activeColor="bg-emerald-500"
                      icon={isActive ? <UserCheck className="h-4 w-4 text-emerald-500" /> : <UserX className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />}
                    />
                  )}
                </div>
              </div>

              {/* Team Memberships Section (detail mode only) */}
              {mode === "detail" && user && (
                <div className="space-y-3 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      Teams ({user.teams.length})
                    </h3>
                    <Button variant="outline" size="sm" onClick={() => setShowAddTeam(!showAddTeam)} className="h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" />
                      Add to team
                    </Button>
                  </div>

                  {showAddTeam && (
                    <div className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 p-3">
                      <div className="flex gap-2">
                        <Input placeholder="Team name..." value={addTeamName} onChange={(e) => setAddTeamName(e.target.value)} className="flex-1 h-8 text-sm" />
                        <select value={addTeamRole} onChange={(e) => setAddTeamRole(e.target.value)} className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs">
                          {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                        </select>
                        <Button size="sm" className="h-8" onClick={handleAddToTeam} disabled={addingTeam || !addTeamName}>
                          {addingTeam ? <Spinner className="h-3.5 w-3.5" /> : "Add"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {user.teams.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-[hsl(var(--border))] py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
                      Not a member of any team.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {user.teams.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{t.name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t.role}</Badge>
                          </div>
                          <button onClick={() => handleRemoveTeam(t)} className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
            <Button onClick={mode === "create" ? handleCreate : handleUpdate} disabled={busy || (mode === "create" && (!email || password.length < 8))}>
              {busy && <Spinner className="mr-2 h-4 w-4" />}
              {mode === "create" ? "Create User" : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
