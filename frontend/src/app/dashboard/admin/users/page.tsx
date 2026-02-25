"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, ShieldCheck, ShieldOff, UserX, MoreHorizontal, UserPlus } from "lucide-react";

import { api, type AdminUserRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AdminUserDialog } from "@/components/admin-user-dialog";

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "detail">("create");
  const [dialogUserId, setDialogUserId] = useState<string | undefined>();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .listUsers({ q: debouncedSearch || undefined, limit: 100 })
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!actionMenu) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const root = document.querySelector(`[data-action-menu-root="${actionMenu}"]`);
      if (root && root.contains(target)) return;
      setActionMenu(null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActionMenu(null);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [actionMenu]);

  function openCreate() {
    setDialogMode("create");
    setDialogUserId(undefined);
    setDialogOpen(true);
  }

  function openDetail(userId: string) {
    setDialogMode("detail");
    setDialogUserId(userId);
    setDialogOpen(true);
  }

  async function toggleActive(u: AdminUserRow) {
    setBusy(u.id);
    try {
      const updated = await api.admin.updateUser(u.id, { is_active: !u.is_active });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
    } catch { /* swallow */ }
    setBusy(null);
    setActionMenu(null);
  }

  async function toggleSuperuser(u: AdminUserRow) {
    setBusy(u.id);
    try {
      const updated = await api.admin.updateUser(u.id, { is_superuser: !u.is_superuser });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
    } catch { /* swallow */ }
    setBusy(null);
    setActionMenu(null);
  }

  async function deleteUser(u: AdminUserRow) {
    if (!confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
    setBusy(u.id);
    try {
      await api.admin.deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch { /* swallow */ }
    setBusy(null);
    setActionMenu(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage all users across the platform.
          </p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
        <Input
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      ) : users.length === 0 ? (
        <p className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">No users found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
          <table className="min-w-[640px] w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                <th className="px-4 py-3 text-left font-medium">User</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Teams</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted))]/50 transition-colors">
                    <td className="px-4 py-3 cursor-pointer" onClick={() => openDetail(u.id)}>
                      <div className="font-medium">{u.email}</div>
                      {u.full_name && (
                        <div className="text-xs text-[hsl(var(--muted-foreground))]">{u.full_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.is_active ? "default" : "secondary"}>
                        {u.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_superuser ? (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Superuser
                        </Badge>
                      ) : (
                        <span className="text-[hsl(var(--muted-foreground))]">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.teams.length === 0 ? (
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">None</span>
                        ) : u.teams.map((t) => (
                          <Badge key={t.id} variant="outline" className="text-xs">
                            {t.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block" data-action-menu-root={u.id}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setActionMenu(actionMenu === u.id ? null : u.id)}
                          disabled={busy === u.id}
                        >
                          {busy === u.id ? <Spinner className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
                        </Button>
                        {actionMenu === u.id && (
                          <>
                            <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1 shadow-lg">
                              <button
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-40"
                                onClick={() => toggleActive(u)}
                                disabled={isSelf}
                              >
                                {u.is_active ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                {u.is_active ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-40"
                                onClick={() => toggleSuperuser(u)}
                                disabled={isSelf}
                              >
                                <ShieldCheck className="h-4 w-4" />
                                {u.is_superuser ? "Remove superuser" : "Make superuser"}
                              </button>
                              <div className="my-1 border-t border-[hsl(var(--border))]" />
                              <button
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-40"
                                onClick={() => deleteUser(u)}
                                disabled={isSelf}
                              >
                                <UserX className="h-4 w-4" />
                                Delete user
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminUserDialog
        mode={dialogMode}
        userId={dialogUserId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
