"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Folder, Link2, Plus, X } from "lucide-react";
import { api, type NodePublic, type CollectionPublic } from "@/lib/api";
import {
  loadCollections,
  resourceError,
  resourceHref,
  safeResourceUrl,
} from "@/lib/resources";
import { loadAllNodePages } from "@/lib/node-table";
import { NodeDate } from "@/components/node-children-table";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CollectionPicker, ResourcePicker } from "@/components/resource-picker";

export function ResourceConnections({
  node,
  canWrite,
  onChanged,
}: {
  node: NodePublic;
  canWrite: boolean;
  onChanged?: () => void;
}) {
  const [collections, setCollections] = useState<CollectionPublic[]>([]);
  const [related, setRelated] = useState<NodePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [picker, setPicker] = useState<"collection" | "resource" | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      loadCollections(node.team_id, node.id, () => cancelled),
      loadAllNodePages(
        (page) => api.nodes.links(node.team_id, node.id, page),
        () => cancelled,
      ),
    ])
      .then(([groups, nodes]) => {
        if (!cancelled) {
          setCollections(groups);
          setRelated(nodes);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(resourceError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [node.team_id, node.id, revision]);
  async function change(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError(resourceError(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}{" "}
          <button
            className="underline"
            onClick={() => setRevision((v) => v + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : (
        <>
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold">In collections</h3>
              {canWrite && (
                <button
                  aria-label="Add to collection"
                  disabled={busy}
                  onClick={() => setPicker("collection")}
                  className="rounded p-1 hover:bg-[hsl(var(--muted))]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {collections.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-xs"
                >
                  <Link
                    href={`/dashboard/collections/${c.id}`}
                    className="flex min-w-0 items-center gap-1.5 hover:underline"
                  >
                    <Folder className="h-3 w-3 shrink-0" />
                    <span className="break-words">{c.name}</span>
                  </Link>
                  {canWrite && (
                    <button
                      disabled={busy}
                      aria-label={`Remove from ${c.name}`}
                      onClick={() => {
                        change(() =>
                          api.collections.removeNode(
                            node.team_id,
                            c.id,
                            node.id,
                          ),
                        ).catch(() => {});
                      }}
                      className="p-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {!collections.length && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Not in a collection. Collections are optional.
              </p>
            )}
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold">
                <Link2 className="h-3.5 w-3.5" />
                Related resources
              </h3>
              {canWrite && (
                <button
                  aria-label="Link resource"
                  disabled={busy}
                  onClick={() => setPicker("resource")}
                  className="rounded p-1 hover:bg-[hsl(var(--muted))]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            {related.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 border-t border-[hsl(var(--border))] py-3"
              >
                <Link
                  href={resourceHref(r)}
                  className="min-w-0 flex-1 text-sm hover:underline"
                >
                  <span className="block break-words">{r.name}</span>
                  <span className="text-xs capitalize text-[hsl(var(--muted-foreground))]">
                    {r.kind}
                  </span>
                </Link>
                {canWrite && (
                  <button
                    disabled={busy}
                    aria-label={`Unlink ${r.name}`}
                    className="rounded p-1 hover:bg-[hsl(var(--muted))]"
                    onClick={() => {
                      change(() =>
                        api.nodes.unlink(node.team_id, node.id, r.id),
                      ).catch(() => {});
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!related.length && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Link a runbook, system, document, or channel when useful.
              </p>
            )}
          </section>
        </>
      )}
      {picker === "collection" && (
        <CollectionPicker
          teamId={node.team_id}
          exclude={collections.map((c) => c.id)}
          onClose={() => setPicker(null)}
          onPick={(c) =>
            change(() => api.collections.addNode(node.team_id, c.id, node.id))
          }
        />
      )}
      {picker === "resource" && (
        <ResourcePicker
          teamId={node.team_id}
          title="Link a related resource"
          exclude={[node.id, ...related.map((r) => r.id)]}
          onClose={() => setPicker(null)}
          onPick={(r) =>
            change(() => api.nodes.link(node.team_id, node.id, r.id))
          }
        />
      )}
    </div>
  );
}

export function ResourceDetails({
  node,
  canWrite,
  onEdit,
  onDelete,
  onClose,
  onChanged,
}: {
  node: NodePublic;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const sourceUrl = safeResourceUrl(node.url);
  return (
    <aside
      aria-label="Resource details"
      className="min-w-0 self-start rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
    >
      <div className="border-b border-[hsl(var(--border))] p-5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs capitalize text-[hsl(var(--muted-foreground))]">
            {node.kind}
            {node.source_name ? ` · ${node.source_name}` : ""}
          </span>
          <button
            aria-label="Close resource details"
            onClick={onClose}
            className="rounded p-1 hover:bg-[hsl(var(--muted))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="mt-2 break-words text-lg font-semibold">{node.name}</h2>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            Open original
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {canWrite && (
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              Delete
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-5 p-5">
        {(node.hostname || node.ip) && (
          <dl className="space-y-2 text-xs">
            {node.hostname && (
              <div>
                <dt className="text-[hsl(var(--muted-foreground))]">
                  Hostname
                </dt>
                <dd className="break-all">{node.hostname}</dd>
              </div>
            )}
            {node.ip && (
              <div>
                <dt className="text-[hsl(var(--muted-foreground))]">
                  IP address
                </dt>
                <dd>{node.ip}</dd>
              </div>
            )}
          </dl>
        )}
        <section>
          <h3 className="mb-2 text-xs font-semibold">Summary</h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {node.summary || "No summary added yet."}
          </p>
          {node.summary && (
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              Manually curated
            </p>
          )}
        </section>
        {node.notes && (
          <details>
            <summary className="text-xs font-semibold">Notes</summary>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
              {node.notes}
            </p>
          </details>
        )}
        {!!node.tags.length && (
          <div className="flex flex-wrap gap-1.5">
            {node.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-[hsl(var(--muted))] px-2 py-1 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <dt className="text-[hsl(var(--muted-foreground))]">
            Source created
          </dt>
          <dd>
            <NodeDate value={node.document_created_at} />
          </dd>
          <dt className="text-[hsl(var(--muted-foreground))]">
            Source last edited
          </dt>
          <dd>
            <NodeDate value={node.document_updated_at} />
          </dd>
          <dt className="text-[hsl(var(--muted-foreground))]">
            Added to NodeByte
          </dt>
          <dd>
            <NodeDate value={node.created_at} />
          </dd>
          <dt className="text-[hsl(var(--muted-foreground))]">
            Record updated
          </dt>
          <dd>
            <NodeDate value={node.updated_at} />
          </dd>
        </dl>
        <ResourceConnections
          key={node.id}
          node={node}
          canWrite={canWrite}
          onChanged={onChanged}
        />
      </div>
    </aside>
  );
}
