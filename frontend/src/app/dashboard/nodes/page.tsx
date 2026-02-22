"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Server, Pencil, Trash2, Tags, X } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { api, type NodePublic } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { NodeDialog } from "@/components/node-dialog";
import { NodeDetailDialog } from "@/components/node-detail-dialog";
import { BulkTagDialog } from "@/components/bulk-tag-dialog";

export default function NodesPage() {
  const { activeTeam } = useAuth();
  const [nodes, setNodes] = useState<NodePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NodePublic | null>(null);
  const [viewing, setViewing] = useState<NodePublic | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [tagDialogMode, setTagDialogMode] = useState<"add" | "remove" | null>(null);

  const load = useCallback(async () => {
    if (!activeTeam) return;
    setLoading(true);
    try {
      const data = await api.nodes.list(activeTeam.id, { q: query || undefined, limit: 200 });
      setNodes(data);
    } catch {
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [activeTeam, query]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setSelectedIds(new Set()); }, [activeTeam, query]);

  const allSelected = nodes.length > 0 && selectedIds.size === nodes.length;
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(nodes.map((n) => n.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedNodes = useMemo(
    () => nodes.filter((n) => selectedIds.has(n.id)),
    [nodes, selectedIds],
  );

  const unionTags = useMemo(() => {
    const set = new Set<string>();
    for (const node of selectedNodes) {
      for (const tag of node.tags) set.add(tag);
    }
    return [...set].sort();
  }, [selectedNodes]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(node: NodePublic) {
    setEditing(node);
    setDialogOpen(true);
  }

  async function handleDelete(node: NodePublic) {
    if (!activeTeam) return;
    if (!confirm(`Delete "${node.name}"?`)) return;
    await api.nodes.delete(activeTeam.id, node.id);
    load();
  }

  async function handleBulkDelete() {
    if (!activeTeam || selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} node${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      await api.nodes.bulkDelete(activeTeam.id, [...selectedIds]);
      setSelectedIds(new Set());
      load();
    } finally {
      setBulkBusy(false);
    }
  }

  function handleBulkTagDone() {
    setTagDialogMode(null);
    setSelectedIds(new Set());
    load();
  }

  function handleSaved() {
    setDialogOpen(false);
    setEditing(null);
    load();
  }

  const kindColors: Record<string, string> = {
    device: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    site: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    service: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    other: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Nodes</h1>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add node
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
        <Input
          placeholder="Search by name, host, IP, URL..."
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {someSelected && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-4 py-2.5">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <div className="mx-1 h-4 w-px bg-[hsl(var(--border))]" />
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            disabled={bulkBusy}
            onClick={() => setTagDialogMode("add")}
          >
            <Tags className="h-3.5 w-3.5" />
            Add tags
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            disabled={bulkBusy || unionTags.length === 0}
            onClick={() => setTagDialogMode("remove")}
          >
            <Tags className="h-3.5 w-3.5" />
            Remove tags
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            disabled={bulkBusy}
            onClick={handleBulkDelete}
          >
            {bulkBusy ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : nodes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Server className="mx-auto h-10 w-10 text-[hsl(var(--muted-foreground))]" />
            <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
              {query ? "No nodes match your search." : "No nodes yet. Click \"Add node\" to create one."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                <th className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Kind</th>
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Host / IP</th>
                <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Tags</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => {
                const checked = selectedIds.has(node.id);
                return (
                  <tr
                    key={node.id}
                    className={`border-b border-[hsl(var(--border))] last:border-0 transition-colors ${checked ? "bg-[hsl(var(--muted))]/60" : "hover:bg-[hsl(var(--muted))]/50"}`}
                  >
                    <td className="w-10 px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(node.id)}
                        className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setViewing(node)}
                        className="text-left font-medium hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                      >
                        {node.name}
                      </button>
                      {node.url && <div className="truncate text-xs text-[hsl(var(--muted-foreground))]">{node.url}</div>}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${kindColors[node.kind] ?? kindColors.other}`}>
                        {node.kind}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="text-[hsl(var(--muted-foreground))]">
                        {node.hostname ?? node.ip ?? "—"}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {node.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                        {node.tags.length > 3 && (
                          <Badge variant="outline">+{node.tags.length - 3}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(node)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(node)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <NodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        node={editing}
        teamId={activeTeam?.id ?? ""}
        onSaved={handleSaved}
      />

      <NodeDetailDialog
        open={!!viewing}
        onOpenChange={(open) => { if (!open) setViewing(null); }}
        node={viewing}
        onEdit={(node) => { setViewing(null); openEdit(node); }}
      />

      <BulkTagDialog
        open={tagDialogMode !== null}
        onOpenChange={(open) => { if (!open) setTagDialogMode(null); }}
        mode={tagDialogMode ?? "add"}
        teamId={activeTeam?.id ?? ""}
        nodeIds={[...selectedIds]}
        availableTags={unionTags}
        onDone={handleBulkTagDone}
      />
    </div>
  );
}
