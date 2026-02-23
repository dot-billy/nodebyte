"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Building2, Server, ArrowRight } from "lucide-react";

import { api, type AdminStats } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin.stats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const cards = [
    { label: "Total users", value: stats?.total_users ?? 0, icon: Users, href: "/dashboard/admin/users", color: "text-blue-500" },
    { label: "Total teams", value: stats?.total_teams ?? 0, icon: Building2, href: "/dashboard/admin/teams", color: "text-emerald-500" },
    { label: "Total nodes", value: stats?.total_nodes ?? 0, icon: Server, href: "/dashboard/admin/teams", color: "text-amber-500" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Console</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          System-wide overview and management.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, href, color }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <Icon className={`h-5 w-5 ${color}`} />
              <ArrowRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="mt-4 text-3xl font-bold">{value.toLocaleString()}</div>
            <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
