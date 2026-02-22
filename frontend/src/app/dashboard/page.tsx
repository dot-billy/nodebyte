"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Server, Users, Activity } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { api, type NodePublic } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { activeTeam, user } = useAuth();
  const [nodes, setNodes] = useState<NodePublic[]>([]);
  const [nodeCount, setNodeCount] = useState(0);

  useEffect(() => {
    if (!activeTeam) return;
    api.nodes.count(activeTeam.id).then((r) => setNodeCount(r.count)).catch(() => {});
    api.nodes.list(activeTeam.id, { limit: 5 }).then((n) => setNodes(n)).catch(() => {});
  }, [activeTeam]);

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
            <div className="text-2xl font-bold">{nodeCount}</div>
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
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Activity className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Healthy</div>
          </CardContent>
        </Card>
      </div>

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
