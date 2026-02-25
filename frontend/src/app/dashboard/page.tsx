"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Server, Users, Activity, Tag, Clock } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { api, type NodePublic, type NodeStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { activeTeam, user } = useAuth();
  const [nodes, setNodes] = useState<NodePublic[]>([]);
  const [stats, setStats] = useState<NodeStats | null>(null);

  useEffect(() => {
    if (!activeTeam) return;
    api.nodes.stats(activeTeam.id).then(setStats).catch(() => setStats(null));
    api.nodes.list(activeTeam.id, { limit: 5 }).then((n) => setNodes(n)).catch(() => {});
  }, [activeTeam]);

  const byKind = stats?.by_kind ?? {};
  const kindItems = [
    { kind: "device", label: "Devices" },
    { kind: "site", label: "Sites" },
    { kind: "service", label: "Services" },
    { kind: "other", label: "Other" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{user?.full_name ? `, ${user.full_name}` : ""}
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {activeTeam ? `Team: ${activeTeam.name}` : "Select a team to get started."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Nodes</CardTitle>
            <Server className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
            {stats && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {kindItems.map((k) => (
                  <Badge key={k.kind} variant="secondary" className="text-xs">
                    {k.label}: {byKind[k.kind] ?? 0}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Team</CardTitle>
            <Users className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTeam?.name ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Activity</CardTitle>
            <Clock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          </CardHeader>
          <CardContent>
            {stats ? (
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Seen (24h)</span>
                  <span className="font-medium">{stats.last_seen.last_24h}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Seen (7d)</span>
                  <span className="font-medium">{stats.last_seen.last_7d}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Seen (30d)</span>
                  <span className="font-medium">{stats.last_seen.last_30d}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Never seen</span>
                  <span className="font-medium">{stats.last_seen.never}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[hsl(var(--muted-foreground))]">—</div>
            )}
          </CardContent>
        </Card>
      </div>

      {stats && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Top tags</CardTitle>
              <Tag className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            </CardHeader>
            <CardContent>
              {stats.top_tags.length === 0 ? (
                <div className="text-sm text-[hsl(var(--muted-foreground))]">No tags yet.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {stats.top_tags.map((t) => (
                    <Badge key={t.tag} variant="outline" className="text-xs">
                      {t.tag} <span className="ml-1 text-[hsl(var(--muted-foreground))]">({t.count})</span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
              <Activity className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            </CardHeader>
            <CardContent>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                Coming next: drilldowns (by kind/tag/host) and trend charts.
              </div>
              <div className="mt-3">
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/nodes">Explore nodes</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent nodes</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/nodes">View all</Link>
        </Button>
      </div>

      {nodes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No nodes yet. Add your first one!</p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/nodes">Go to Nodes</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {nodes.map((n) => (
            <Card key={n.id}>
              <CardContent className="flex items-center gap-4 py-3">
                <Server className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{n.name}</div>
                  <div className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {[n.hostname, n.ip, n.url].filter(Boolean).join(" · ") || n.kind}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
