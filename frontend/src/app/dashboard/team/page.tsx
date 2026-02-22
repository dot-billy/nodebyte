"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Shield, Trash2, UserPlus, Copy, Check } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { api, ApiError, type MemberPublic, type InvitePublic } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };
const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  member: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  viewer: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

function canManage(myRole: string | null | undefined) {
  return myRole === "owner" || myRole === "admin";
}

export default function TeamPage() {
  const { activeTeam, user } = useAuth();
  const myRole = activeTeam?.my_role;
  const isManager = canManage(myRole);

  const [members, setMembers] = useState<MemberPublic[]>([]);
  const [invites, setInvites] = useState<InvitePublic[]>([]);
  const [loading, setLoading] = useState(true);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  const load = useCallback(async () => {
    if (!activeTeam) return;
    setLoading(true);
    try {
      const m = await api.members.list(activeTeam.id);
      setMembers(m);
      if (isManager) {
        const inv = await api.invites.list(activeTeam.id);
        setInvites(inv);
      }
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [activeTeam, isManager]);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTeam || !inviteEmail.trim()) return;
    setInviteBusy(true);
    setInviteError("");
    setInviteSuccess("");

    try {
      const inv = await api.invites.create(activeTeam.id, { email: inviteEmail.trim(), role: inviteRole });
      const link = `${window.location.origin}/invite/${inv.token}`;
      setInviteSuccess(link);
      setInviteEmail("");
      load();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to create invite");
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleChangeRole(m: MemberPublic, newRole: string) {
    if (!activeTeam) return;
    try {
      await api.members.updateRole(activeTeam.id, m.id, newRole);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function handleRemove(m: MemberPublic) {
    if (!activeTeam) return;
    if (!confirm(`Remove ${m.email} from the team?`)) return;
    try {
      await api.members.remove(activeTeam.id, m.id);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function handleRevokeInvite(inv: InvitePublic) {
    if (!activeTeam) return;
    if (!confirm(`Revoke invite for ${inv.invited_email}?`)) return;
    try {
      await api.invites.revoke(activeTeam.id, inv.id);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Manage members and invitations for <strong>{activeTeam?.name}</strong>
          </p>
        </div>
        {isManager && (
          <Button size="sm" className="gap-1.5" onClick={() => setShowInvite(!showInvite)}>
            <UserPlus className="h-4 w-4" />
            Invite member
          </Button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && isManager && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleInvite} className="space-y-4">
              {inviteError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
                  {inviteError}
                </div>
              )}
              {inviteSuccess && <InviteLinkBanner link={inviteSuccess} onDismiss={() => setInviteSuccess("")} />}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="inv-email">Email address</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <Label htmlFor="inv-role">Role</Label>
                  <select
                    id="inv-role"
                    className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <Button type="submit" disabled={inviteBusy} className="gap-1.5">
                  {inviteBusy ? <Spinner className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  Send invite
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Members table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
          <table className="w-full min-w-[400px] text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                <th className="px-4 py-3 text-left font-medium">Member</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Role</th>
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Joined</th>
                {isManager && <th className="px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted))]/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{m.full_name || m.email}</div>
                    {m.full_name && <div className="text-xs text-[hsl(var(--muted-foreground))]">{m.email}</div>}
                    {m.user_id === user?.id && <Badge variant="outline" className="ml-1 text-[10px]">you</Badge>}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {isManager && m.role !== "owner" && m.user_id !== user?.id ? (
                      <select
                        className="rounded-md border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-xs font-medium"
                        value={m.role}
                        onChange={(e) => handleChangeRole(m, e.target.value)}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[m.role] ?? ROLE_COLORS.viewer}`}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-[hsl(var(--muted-foreground))] md:table-cell">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </td>
                  {isManager && (
                    <td className="px-4 py-3 text-right">
                      {m.role !== "owner" && m.user_id !== user?.id && (
                        <Button variant="ghost" size="sm" onClick={() => handleRemove(m)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending invites */}
      {isManager && invites.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Pending invites</h2>
          <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Role</th>
                  <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Expires</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-[hsl(var(--border))] last:border-0">
                    <td className="px-4 py-3 font-medium">{inv.invited_email}</td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[inv.role] ?? ROLE_COLORS.viewer}`}>
                        {ROLE_LABELS[inv.role] ?? inv.role}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-[hsl(var(--muted-foreground))] md:table-cell">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleRevokeInvite(inv)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function InviteLinkBanner({ link, onDismiss }: { link: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    copyToClipboard(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 rounded-md bg-green-50 p-3 dark:bg-green-950">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-green-800 dark:text-green-300">Invite created! Share this link:</div>
        <div className="mt-1 truncate font-mono text-xs text-green-700 dark:text-green-400">{link}</div>
      </div>
      <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={handleCopy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <button onClick={onDismiss} className="text-green-600 hover:text-green-800 dark:text-green-400">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  );
}
