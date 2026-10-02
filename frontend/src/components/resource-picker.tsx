"use client";

import { useEffect, useState } from "react";
import { api, type NodePublic, type CollectionPublic } from "@/lib/api";
import { loadCollections, resourceError } from "@/lib/resources";
import { ResourceModal } from "@/components/resource-modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ResourcePicker({
  teamId,
  title,
  exclude = [],
  onPick,
  onClose,
}: {
  teamId: string;
  title: string;
  exclude?: string[];
  onPick: (node: NodePublic) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [nodes, setNodes] = useState<NodePublic[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api.nodes
        .list(teamId, { q: query, limit: 50, offset })
        .then((page) => {
          if (!cancelled) {
            setNodes((previous) => (offset ? [...previous, ...page] : page));
            setMore(page.length === 50);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(resourceError(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [teamId, query, offset]);
  async function pick(node: NodePublic) {
    setBusy(true);
    setError("");
    try {
      await onPick(node);
      onClose();
    } catch (err) {
      setError(resourceError(err));
    } finally {
      setBusy(false);
    }
  }
  const available = nodes.filter((n) => !exclude.includes(n.id));
  return (
    <ResourceModal title={title} onClose={onClose} busy={busy}>
      <Input
        aria-label="Find a resource"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOffset(0);
          setNodes([]);
        }}
        placeholder="Search names, summaries, notes, or tags…"
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mt-4 space-y-2">
        {available.map((n) => (
          <button
            key={n.id}
            disabled={busy || loading}
            onClick={() => pick(n)}
            className="block w-full rounded-lg border border-[hsl(var(--border))] p-3 text-left hover:bg-[hsl(var(--muted))] disabled:opacity-50"
          >
            <span className="block text-sm font-medium">{n.name}</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {n.kind}
              {n.summary ? ` · ${n.summary.slice(0, 100)}` : ""}
            </span>
          </button>
        ))}
      </div>
      {loading && <Spinner className="mx-auto my-5" />}
      {!loading && !error && !available.length && (
        <p className="my-5 text-sm text-[hsl(var(--muted-foreground))]">
          No matching resources on this page.
        </p>
      )}
      {more && (
        <Button
          className="mt-3"
          variant="outline"
          disabled={loading || busy}
          onClick={() => setOffset((v) => v + 50)}
        >
          Load more
        </Button>
      )}
    </ResourceModal>
  );
}

export function CollectionPicker({
  teamId,
  exclude,
  onPick,
  onClose,
}: {
  teamId: string;
  exclude: string[];
  onPick: (collection: CollectionPublic) => Promise<void>;
  onClose: () => void;
}) {
  const [collections, setCollections] = useState<CollectionPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    loadCollections(teamId, undefined, () => cancelled)
      .then((result) => {
        if (!cancelled) setCollections(result);
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
  }, [teamId]);
  const available = collections.filter(
    (c) =>
      !exclude.includes(c.id) &&
      c.name.toLowerCase().includes(query.toLowerCase()),
  );
  async function pick(collection: CollectionPublic) {
    setBusy(true);
    setError("");
    try {
      await onPick(collection);
      onClose();
    } catch (err) {
      setError(resourceError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResourceModal title="Add to a collection" onClose={onClose} busy={busy}>
      <Input
        aria-label="Find a collection"
        placeholder="Find a collection…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {loading ? (
        <Spinner className="mx-auto my-5" />
      ) : (
        <div className="mt-4 space-y-2">
          {available.map((c) => (
            <button
              key={c.id}
              disabled={busy}
              onClick={() => pick(c)}
              className="block w-full rounded-lg border border-[hsl(var(--border))] p-3 text-left text-sm hover:bg-[hsl(var(--muted))]"
            >
              {c.name}
            </button>
          ))}
          {!available.length && !error && (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No available collections. Create one from Collections, then add
              this resource.
            </p>
          )}
        </div>
      )}
    </ResourceModal>
  );
}
