"use client";

import { useState } from "react";
import { api, type NodePublic, type CollectionPublic } from "@/lib/api";
import { KNOWLEDGE_KINDS, resourceError } from "@/lib/resources";
import { documentDatePayload, toLocalDateInput } from "@/lib/node-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResourceModal } from "@/components/resource-modal";

export const resourceInputClass =
  "w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

export function ResourceEditor({
  teamId,
  node,
  defaultKind,
  onClose,
  onSaved,
}: {
  teamId: string;
  node?: NodePublic;
  defaultKind: string;
  onClose: () => void;
  onSaved: (node: NodePublic) => void;
}) {
  const [kind, setKind] = useState(node?.kind ?? defaultKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const knowledge = KNOWLEDGE_KINDS.includes(kind);
  const kinds = [
    ...new Set([
      "device",
      "site",
      "service",
      "cluster",
      "namespace",
      "workload",
      "ingress",
      "other",
      ...KNOWLEDGE_KINDS,
      kind,
    ]),
  ];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    try {
      const data = {
        name: value("name"),
        kind,
        url: value("url") || null,
        hostname: knowledge
          ? (node?.hostname ?? null)
          : value("hostname") || null,
        ip: knowledge ? (node?.ip ?? null) : value("ip") || null,
        summary: value("summary") || null,
        notes: value("notes") || null,
        source_name: value("source_name") || null,
        tags: [
          ...new Set(
            value("tags")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        ],
        document_created_at: documentDatePayload(
          value("document_created_at"),
          node?.document_created_at,
        ),
        document_updated_at: documentDatePayload(
          value("document_updated_at"),
          node?.document_updated_at,
        ),
      };
      if (!data.name) throw new Error("Enter a resource name.");
      onSaved(
        node
          ? await api.nodes.update(teamId, node.id, data)
          : await api.nodes.create(teamId, data),
      );
    } catch (err) {
      setError(resourceError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResourceModal
      title={node ? "Edit resource" : "Add resource"}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="resource-name">Name</Label>
            <Input
              id="resource-name"
              name="name"
              required
              maxLength={200}
              defaultValue={node?.name}
            />
          </div>
          <div>
            <Label htmlFor="resource-kind">Type</Label>
            <select
              id="resource-kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={resourceInputClass}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="resource-url">Original link</Label>
          <Input
            id="resource-url"
            name="url"
            type="url"
            maxLength={2048}
            defaultValue={node?.url ?? ""}
            placeholder="https://…"
          />
        </div>
        {!knowledge && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="resource-hostname">Hostname</Label>
              <Input
                id="resource-hostname"
                name="hostname"
                maxLength={255}
                defaultValue={node?.hostname ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="resource-ip">IP address</Label>
              <Input
                id="resource-ip"
                name="ip"
                maxLength={64}
                defaultValue={node?.ip ?? ""}
              />
            </div>
          </div>
        )}
        <div>
          <Label htmlFor="resource-summary">Summary</Label>
          <textarea
            id="resource-summary"
            name="summary"
            rows={3}
            maxLength={20000}
            defaultValue={node?.summary ?? ""}
            className={resourceInputClass}
            placeholder="What is this resource about, and when is it useful?"
          />
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Saved summaries and notes are visible to this NodeByte team.
          </p>
        </div>
        <div>
          <Label htmlFor="resource-notes">Notes</Label>
          <textarea
            id="resource-notes"
            name="notes"
            rows={4}
            defaultValue={node?.notes ?? ""}
            className={resourceInputClass}
            placeholder="Your context, instructions, or reference material…"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="resource-source">Source label</Label>
            <Input
              id="resource-source"
              name="source_name"
              maxLength={120}
              defaultValue={node?.source_name ?? ""}
              placeholder="Google Docs, Slack, vendor docs…"
            />
          </div>
          <div>
            <Label htmlFor="resource-tags">Tags</Label>
            <Input
              id="resource-tags"
              name="tags"
              defaultValue={node?.tags.join(", ")}
              placeholder="Networking, Operations"
            />
          </div>
        </div>
        <fieldset className="rounded-lg border border-[hsl(var(--border))] p-3">
          <legend className="px-1 text-sm font-medium">
            Source dates · optional
          </legend>
          <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
            Enter dates from the original source in your local timezone.
            NodeByte records its own added and updated dates separately.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="resource-created">Source created</Label>
              <Input
                id="resource-created"
                name="document_created_at"
                type="datetime-local"
                step="0.001"
                defaultValue={toLocalDateInput(node?.document_created_at)}
              />
            </div>
            <div>
              <Label htmlFor="resource-updated">Source last edited</Label>
              <Input
                id="resource-updated"
                name="document_updated_at"
                type="datetime-local"
                step="0.001"
                defaultValue={toLocalDateInput(node?.document_updated_at)}
              />
            </div>
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button disabled={busy}>{busy ? "Saving…" : "Save resource"}</Button>
        </div>
      </form>
    </ResourceModal>
  );
}

export function CollectionEditor({
  teamId,
  collection,
  onClose,
  onSaved,
}: {
  teamId: string;
  collection?: CollectionPublic;
  onClose: () => void;
  onSaved: (collection: CollectionPublic) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const data = {
      name: String(form.get("name") ?? "").trim(),
      description: String(form.get("description") ?? "").trim() || null,
    };
    try {
      if (!data.name) throw new Error("Enter a collection name.");
      onSaved(
        collection
          ? await api.collections.update(teamId, collection.id, data)
          : await api.collections.create(teamId, data),
      );
    } catch (err) {
      setError(resourceError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResourceModal
      title={collection ? "Edit collection" : "New collection"}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div>
          <Label htmlFor="collection-name">Name</Label>
          <Input
            id="collection-name"
            name="name"
            required
            maxLength={200}
            defaultValue={collection?.name}
            placeholder="Home lab, Platform operations, Acme rollout…"
          />
        </div>
        <div>
          <Label htmlFor="collection-description">Description</Label>
          <textarea
            id="collection-description"
            name="description"
            maxLength={20000}
            defaultValue={collection?.description ?? ""}
            rows={3}
            className={resourceInputClass}
            placeholder="What belongs here?"
          />
        </div>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Resources can belong to several collections. Everyone with access to
          this team can view the collection.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button disabled={busy}>
            {busy ? "Saving…" : "Save collection"}
          </Button>
        </div>
      </form>
    </ResourceModal>
  );
}
