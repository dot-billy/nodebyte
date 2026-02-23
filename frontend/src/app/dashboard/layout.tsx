"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Server,
  LogOut,
  LayoutDashboard,
  ChevronDown,
  Plus,
  Users,
  KeyRound,
  Settings,
  Download,
  Menu,
  X,
  Shield,
  UsersRound,
  Building2,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CreateTeamDialog } from "@/components/create-team-dialog";

const NAV_ITEMS: readonly { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; muted?: boolean }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/nodes", label: "Nodes", icon: Server },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/tokens", label: "Tokens", icon: KeyRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/download", label: "Get Extension", icon: Download, muted: true },
];

const ADMIN_NAV_ITEMS: readonly { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { href: "/dashboard/admin", label: "Overview", icon: Shield, exact: true },
  { href: "/dashboard/admin/users", label: "Users", icon: UsersRound },
  { href: "/dashboard/admin/teams", label: "Teams", icon: Building2 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, teams, activeTeam, setActiveTeam, reloadTeams, logout, loading } = useAuth();
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!user) return null;

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  function navLinkClass(href: string, exact?: boolean, muted?: boolean) {
    const active = isActive(href, exact);
    return [
      "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
      active
        ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm"
        : muted
          ? "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--background))] hover:text-[hsl(var(--foreground))]"
          : "hover:bg-[hsl(var(--background))] transition-colors",
    ].join(" ");
  }

  const teamSwitcher = teams && teams.length > 0 && (
    <div className="border-b border-[hsl(var(--border))] p-3">
      <div className="relative">
        <select
          className="w-full appearance-none rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          value={activeTeam?.id ?? ""}
          onChange={(e) => {
            const t = teams.find((tm) => tm.id === e.target.value);
            if (t) setActiveTeam(t);
          }}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
      </div>
      <button
        onClick={() => setShowCreateTeam(true)}
        className="mt-2 flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--background))] hover:text-[hsl(var(--foreground))] transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        New team
      </button>
    </div>
  );

  const navLinks = (
    <nav className="flex-1 space-y-1 p-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon, exact, muted }) => (
        <Link key={href} href={href} className={navLinkClass(href, exact, muted)}>
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
      {user.is_superuser && (
        <>
          <div className="my-3 border-t border-[hsl(var(--border))]" />
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Admin
          </div>
          {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => (
            <Link key={href} href={href} className={navLinkClass(href, exact)}>
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </>
      )}
    </nav>
  );

  const userFooter = (
    <div className="border-t border-[hsl(var(--border))] p-3">
      <div className="mb-2 truncate px-3 text-xs text-[hsl(var(--muted-foreground))]">
        {user.email}
      </div>
      <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => { logout(); router.push("/"); }}>
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-[hsl(var(--border))] bg-[hsl(var(--muted))] md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-[hsl(var(--border))] px-4">
          <Link href="/dashboard" className="text-lg font-bold">Nodebyte</Link>
        </div>
        {teamSwitcher}
        {navLinks}
        {userFooter}
      </aside>

      {/* Mobile slide-out menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={() => setMobileMenuOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[hsl(var(--muted))] shadow-xl animate-slide-in-left">
            <div className="flex h-14 items-center justify-between border-b border-[hsl(var(--border))] px-4">
              <Link href="/dashboard" className="text-lg font-bold">Nodebyte</Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--background))] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {teamSwitcher}
            {navLinks}
            {userFooter}
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-3 border-b border-[hsl(var(--border))] px-4 md:hidden">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-md p-2 -ml-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/dashboard" className="text-lg font-bold">Nodebyte</Link>
          <div className="flex-1" />
          <span className="hidden text-xs text-[hsl(var(--muted-foreground))] sm:inline">{user.email}</span>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>

      <CreateTeamDialog
        open={showCreateTeam}
        onOpenChange={setShowCreateTeam}
        onCreated={async () => {
          setShowCreateTeam(false);
          await reloadTeams();
        }}
      />
    </div>
  );
}
