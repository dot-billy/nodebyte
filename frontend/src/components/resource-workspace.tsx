"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  FileText,
  Folder,
  Hash,
  Link as LinkIcon,
  Plus,
  Search,
  Server,
} from "lucide-react";
import {
  api,
  type CollectionPublic,
  type NodePublic,
  type TeamPublic,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  isKnowledge,
  loadCollections,
  resourceError,
  resourceHref,
} from "@/lib/resources";
import { ResourceDetails } from "@/components/resource-details";
import { CollectionEditor, ResourceEditor } from "@/components/resource-editor";
import { ResourcePicker } from "@/components/resource-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type View = "inventory" | "knowledge" | "collections" | "collection" | "search";
type Props = { view: View; collectionId?: string };

function ResourceIcon({ node }: { node: NodePublic }) {
  const Icon =
    node.kind === "channel"
      ? Hash
      : node.kind === "link"
        ? LinkIcon
        : isKnowledge(node)
          ? FileText
          : Server;
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isKnowledge(node) ? "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"}`}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function Workspace({ team, view, collectionId }: Props & { team: TeamPublic }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("resource");
  const searchQuery = view === "search" ? (params.get("q") ?? "") : "";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [nodes, setNodes] = useState<NodePublic[]>([]);
  const [collections, setCollections] = useState<CollectionPublic[]>([]);
  const [collection, setCollection] = useState<CollectionPublic | null>(null);
  const [selected, setSelected] = useState<NodePublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectLoading, setSelectLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [editor, setEditor] = useState<NodePublic | "new" | null>(null);
  const [collectionEditor, setCollectionEditor] = useState<
    CollectionPublic | "new" | null
  >(null);
  const [addingExisting, setAddingExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const canWrite = ["owner", "admin", "member"].includes(team.my_role ?? "");
  const changed = () => {
    setOffset(0);
    setRevision((r) => r + 1);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      async () => {
        try {
          if (view === "collections") {
            const groups = await loadCollections(
              team.id,
              undefined,
              () => cancelled,
            );
            if (!cancelled) setCollections(groups);
          } else {
            const [page, group] = await Promise.all([
              api.nodes.list(team.id, {
                scope:
                  filter === "inventory"
                    ? "inventory"
                    : view === "inventory" || view === "knowledge"
                      ? view
                      : undefined,
                collection_id: collectionId,
                q: searchQuery || query,
                kind:
                  filter === "documents"
                    ? ["document", "link"]
                    : filter === "channels"
                      ? ["channel"]
                      : undefined,
                limit: 60,
                offset,
              }),
              collectionId
                ? api.collections.get(team.id, collectionId)
                : Promise.resolve(null),
            ]);
            if (!cancelled) {
              setNodes((old) => (offset ? [...old, ...page] : page));
              setMore(page.length === 60);
              setCollection(group);
            }
          }
        } catch (err) {
          if (!cancelled) setError(resourceError(err));
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      query ? 180 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    team.id,
    view,
    collectionId,
    query,
    searchQuery,
    filter,
    offset,
    revision,
  ]);

  useEffect(() => {
    let cancelled = false;
    setSelected(null);
    setSelectionError("");
    if (!selectedId || view === "collections") {
      setSelectLoading(false);
      return;
    }
    setSelectLoading(true);
    api.nodes
      .get(team.id, selectedId)
      .then((node) => {
        if (!cancelled) setSelected(node);
      })
      .catch((err) => {
        if (!cancelled) setSelectionError(resourceError(err));
      })
      .finally(() => {
        if (!cancelled) setSelectLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [team.id, selectedId, revision, view]);

  function select(node: NodePublic | null) {
    const next = new URLSearchParams(params.toString());
    if (node) next.set("resource", node.id);
    else next.delete("resource");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  }
  async function saved(node: NodePublic) {
    const creating = editor === "new";
    setEditor(null);
    setActionError("");
    if (creating && collectionId) {
      try {
        await api.collections.addNode(team.id, collectionId, node.id);
      } catch (err) {
        setActionError(
          `Resource saved, but could not add it to this collection: ${resourceError(err)}. Use “Add existing” to retry.`,
        );
      }
    }
    if (
      view === "collections" ||
      (view === "inventory" && isKnowledge(node)) ||
      (view === "knowledge" && !isKnowledge(node))
    )
      router.push(resourceHref(node));
    else {
      select(node);
      changed();
    }
  }
  async function deleteResource() {
    if (
      !selected ||
      !window.confirm(
        `Delete “${selected.name}”? This removes the NodeByte record and its links, not the original source.`,
      )
    )
      return;
    setBusy(true);
    setActionError("");
    try {
      await api.nodes.delete(team.id, selected.id);
      select(null);
      changed();
    } catch (err) {
      setActionError(resourceError(err));
    } finally {
      setBusy(false);
    }
  }
  async function deleteCollection() {
    if (
      !collection ||
      !window.confirm(
        `Delete “${collection.name}”? Its resources will remain in NodeByte.`,
      )
    )
      return;
    setBusy(true);
    setActionError("");
    try {
      await api.collections.delete(team.id, collection.id);
      router.push("/dashboard/collections");
    } catch (err) {
      setActionError(resourceError(err));
    } finally {
      setBusy(false);
    }
  }

  const headings = {
    inventory: [
      "Inventory",
      "Devices, services, and sites you use or maintain.",
    ],
    knowledge: [
      "Knowledge",
      "Documents, links, and channel directories gathered by your team.",
    ],
    collections: [
      "Collections",
      "Bring resources together around whatever matters to you.",
    ],
    collection: [
      collection?.name ?? "Collection",
      collection?.description ?? "Related resources in one place.",
    ],
    search: [
      "Search",
      searchQuery
        ? `Results for “${searchQuery}” across your team’s resources.`
        : "Search names, summaries, notes, and tags across inventory and knowledge.",
    ],
  };
  const visibleCollections = collections.filter((c) =>
    `${c.name} ${c.description ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <span>{team.name}</span>
        <ChevronRight className="h-3 w-3" />
        {view === "collection" && (
          <>
            <Link href="/dashboard/collections" className="hover:underline">
              Collections
            </Link>
            <ChevronRight className="h-3 w-3" />
          </>
        )}
        <span>{headings[view][0]}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {headings[view][0]}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
            {headings[view][1]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {view === "inventory" && (
            <Link
              href="/dashboard/nodes"
              className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm hover:bg-[hsl(var(--muted))]"
            >
              Table view
            </Link>
          )}
          {canWrite &&
            (view === "collections" ? (
              <Button
                onClick={() => setCollectionEditor("new")}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                New collection
              </Button>
            ) : (
              <>
                {view === "collection" && collection && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setCollectionEditor(collection)}
                    >
                      Edit collection
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setAddingExisting(true)}
                    >
                      Add existing
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={deleteCollection}
                    >
                      Delete collection
                    </Button>
                  </>
                )}
                <Button onClick={() => setEditor("new")} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add resource
                </Button>
              </>
            ))}
        </div>
      </div>
      {actionError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {actionError}
        </p>
      )}
      {view !== "search" && (
        <label className="relative block max-w-xl">
          <Search className="absolute left-3 top-3 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <Input
            aria-label={
              view === "collections" ? "Filter collections" : "Search this view"
            }
            className="pl-9"
            placeholder={
              view === "collections"
                ? "Find a collection…"
                : "Search names, summaries, notes, and tags…"
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
          />
        </label>
      )}
      {["knowledge", "collection", "search"].includes(view) && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Resource type filters"
        >
          {[
            ["all", "All"],
            ...(view !== "knowledge" ? [["inventory", "Inventory"]] : []),
            ["documents", "Documents & links"],
            ["channels", "Channels"],
          ].map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "default" : "outline"}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setOffset(0);
                select(null);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 p-4 text-sm"
        >
          <p>{error}</p>
          <Button variant="outline" className="mt-3" onClick={changed}>
            Retry
          </Button>
        </div>
      ) : view === "collections" ? (
        <>
          {loading ? (
            <Spinner className="my-8" />
          ) : visibleCollections.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleCollections.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/collections/${c.id}`}
                  className="flex items-start gap-3 rounded-xl border border-[hsl(var(--border))] p-5 hover:bg-[hsl(var(--muted))]"
                >
                  <Folder className="mt-1 h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words font-medium">{c.name}</h2>
                    {c.description && (
                      <p className="mt-1 line-clamp-3 text-sm text-[hsl(var(--muted-foreground))]">
                        {c.description}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                      {c.resource_count} resource
                      {c.resource_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-10 text-center">
              <Folder className="mx-auto mb-3 h-7 w-7 text-[hsl(var(--muted-foreground))]" />
              <h2 className="font-medium">
                {query
                  ? "No matching collections"
                  : "Organize around what matters to you"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[hsl(var(--muted-foreground))]">
                {query
                  ? "Try another name or description."
                  : "A home lab, project, environment, or customer rollout. A resource can appear in several collections, or none."}
              </p>
              {canWrite && !query && (
                <Button
                  className="mt-5"
                  onClick={() => setCollectionEditor("new")}
                >
                  Create your first collection
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <div
          className={`grid items-start gap-5 ${selected || selectLoading || selectionError ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}
        >
          <section
            aria-label="Resources"
            aria-busy={loading}
            className="min-w-0 space-y-3"
          >
            {loading && !offset ? (
              <Spinner className="my-8" />
            ) : (
              <>
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => select(node)}
                    aria-pressed={selectedId === node.id}
                    className={`block w-full rounded-xl border p-4 text-left transition-colors ${selectedId === node.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40" : "border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"}`}
                  >
                    <span className="flex items-start gap-3">
                      <ResourceIcon node={node} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium">
                          {node.name}
                        </span>
                        <span className="mt-0.5 block break-all text-xs text-[hsl(var(--muted-foreground))]">
                          {[
                            node.source_name || node.kind,
                            node.hostname ||
                              node.ip ||
                              (node.url
                                ? (() => {
                                    try {
                                      return new URL(node.url).hostname;
                                    } catch {
                                      return "";
                                    }
                                  })()
                                : ""),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                    </span>
                    {(node.summary || node.notes) && (
                      <span className="mt-3 line-clamp-2 whitespace-pre-wrap text-sm text-[hsl(var(--muted-foreground))]">
                        {node.summary || node.notes}
                      </span>
                    )}
                    {!!node.tags.length && (
                      <span className="mt-3 flex flex-wrap gap-1.5">
                        {node.tags.slice(0, 8).map((t) => (
                          <span
                            key={t}
                            className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-xs"
                          >
                            {t}
                          </span>
                        ))}
                        {node.tags.length > 8 && (
                          <span className="text-xs">
                            +{node.tags.length - 8}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                ))}
                {!nodes.length && (
                  <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-10 text-center">
                    <BookOpen className="mx-auto mb-3 h-7 w-7 text-[hsl(var(--muted-foreground))]" />
                    <h2 className="font-medium">
                      {query || searchQuery
                        ? "No matching resources"
                        : "Start with something worth keeping"}
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm text-[hsl(var(--muted-foreground))]">
                      {query || searchQuery
                        ? "Try another name, phrase, or tag."
                        : view === "collection"
                          ? "Add an existing resource or save a new one to this collection."
                          : "Save a document, channel, or system with the context you want to find again."}
                    </p>
                    {canWrite && !query && !searchQuery && (
                      <Button className="mt-5" onClick={() => setEditor("new")}>
                        Add resource
                      </Button>
                    )}
                  </div>
                )}
                {more && (
                  <Button
                    variant="outline"
                    disabled={loading}
                    onClick={() => setOffset((o) => o + 60)}
                  >
                    {loading ? "Loading…" : "Load more resources"}
                  </Button>
                )}
              </>
            )}
          </section>
          {selectLoading ? (
            <Spinner className="my-5" />
          ) : selectionError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {selectionError}
            </p>
          ) : (
            selected && (
              <ResourceDetails
                key={`${selected.id}:${revision}`}
                node={selected}
                canWrite={canWrite && !busy}
                onEdit={() => setEditor(selected)}
                onDelete={deleteResource}
                onClose={() => select(null)}
                onChanged={changed}
              />
            )
          )}
        </div>
      )}
      {editor && (
        <ResourceEditor
          teamId={team.id}
          node={editor === "new" ? undefined : editor}
          defaultKind={view === "inventory" ? "device" : "document"}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {collectionEditor && (
        <CollectionEditor
          teamId={team.id}
          collection={collectionEditor === "new" ? undefined : collectionEditor}
          onClose={() => setCollectionEditor(null)}
          onSaved={(c) => {
            setCollectionEditor(null);
            if (view === "collections")
              router.push(`/dashboard/collections/${c.id}`);
            else changed();
          }}
        />
      )}
      {addingExisting && collectionId && (
        <ResourcePicker
          teamId={team.id}
          title="Add an existing resource"
          exclude={nodes.map((n) => n.id)}
          onClose={() => setAddingExisting(false)}
          onPick={async (n) => {
            await api.collections.addNode(team.id, collectionId, n.id);
            changed();
          }}
        />
      )}
    </div>
  );
}

function TeamWorkspace(props: Props) {
  const { activeTeam } = useAuth();
  const params = useSearchParams();
  const searchKey = props.view === "search" ? (params.get("q") ?? "") : "";
  if (!activeTeam)
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Choose or create a team to start gathering resources.
      </p>
    );
  return (
    <Workspace
      key={`${activeTeam.id}:${props.view}:${props.collectionId ?? ""}:${searchKey}`}
      team={activeTeam}
      {...props}
    />
  );
}

export function ResourceWorkspace(props: Props) {
  return (
    <Suspense fallback={<Spinner />}>
      <TeamWorkspace {...props} />
    </Suspense>
  );
}
