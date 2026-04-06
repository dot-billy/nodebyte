"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type NodePublic } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

interface NodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodePublic | null;
  teamId: string;
  onSaved: () => void;
}

export function NodeDialog({ open, onOpenChange, node, teamId, onSaved }: NodeDialogProps) {
  const isEdit = !!node;

  const [name, setName] = useState("");
  const [kind, setKind] = useState("device");
  const [hostname, setHostname] = useState("");
  const [parentNodeId, setParentNodeId] = useState<string>("");
  const [parentOptions, setParentOptions] = useState<NodePublic[]>([]);
  const [parentLoading, setParentLoading] = useState(false);
  const [ip, setIp] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (node) {
      setName(node.name);
      setKind(node.kind);
      setHostname(node.hostname ?? "");
      setParentNodeId(node.parent_node_id ?? "");
      setIp(node.ip ?? "");
      setUrl(node.url ?? "");
      setTags(node.tags.join(", "));
      setNotes(node.notes ?? "");
    } else {
      setName("");
      setKind("device");
      setHostname("");
      setParentNodeId("");
      setIp("");
      setUrl("");
      setTags("");
      setNotes("");
    }
    setError("");
  }, [node, open]);

  useEffect(() => {
    let cancelled = false;

    async function loadParents() {
      if (!open || !teamId) return;
      setParentLoading(true);
      try {
        const data = await api.nodes.list(teamId, { limit: 200 });
        if (cancelled) return;
        const filtered = data.filter((n) => n.id !== node?.id);
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        setParentOptions(filtered);
      } catch {
        if (!cancelled) setParentOptions([]);
      } finally {
        if (!cancelled) setParentLoading(false);
      }
    }

    loadParents();
    return () => { cancelled = true; };
  }, [open, teamId, node?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    const data = {
      name,
      kind,
      hostname: hostname || null,
      parent_node_id: parentNodeId || null,
      ip: ip || null,
      url: url || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: notes || null,
    };

    try {
      if (isEdit) {
        await api.nodes.update(teamId, node.id, data);
      } else {
        await api.nodes.create(teamId, data);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />

      {/* Dialog */}
      <div className="relative z-50 mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5 sm:p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">{isEdit ? "Edit node" : "Add node"}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nd-name">Name *</Label>
              <Input id="nd-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="web-prod-01" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nd-kind">Kind</Label>
              <select
                id="nd-kind"
                className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="device">Device</option>
                <option value="site">Site</option>
                <option value="service">Service</option>
                <option value="cluster">Cluster</option>
                <option value="namespace">Namespace</option>
                <option value="workload">Workload</option>
                <option value="ingress">Ingress</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nd-hostname">Hostname</Label>
              <Input id="nd-hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="web-prod-01.internal" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nd-ip">IP</Label>
              <Input id="nd-ip" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.0.1.42" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="nd-parent">Parent node</Label>
              {parentLoading && <Spinner className="h-4 w-4" />}
            </div>
            <select
              id="nd-parent"
              className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              value={parentNodeId}
              onChange={(e) => setParentNodeId(e.target.value)}
              disabled={parentLoading}
            >
              <option value="">— None —</option>
              {parentNodeId && !parentOptions.some((p) => p.id === parentNodeId) && (
                <option value={parentNodeId}>
                  Current: {parentNodeId}
                </option>
              )}
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.kind})
                </option>
              ))}
            </select>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Use this to group nodes (parent/child). You can change it later.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nd-url">URL</Label>
            <Input id="nd-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nd-tags">Tags (comma separated)</Label>
            <Input id="nd-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="production, nginx, us-east" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nd-notes">Notes</Label>
            <textarea
              id="nd-notes"
              rows={3}
              className="flex w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this node..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner className="mr-2" />}
              {isEdit ? "Save changes" : "Add node"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
