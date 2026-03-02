"use client";

import { ExternalLink, Copy, Check } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, type NodePublic } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface NodeDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodePublic | null;
  onEdit: (node: NodePublic) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    copyToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className="group inline-flex items-center gap-1.5">
      <span className="font-mono text-sm">{value}</span>
      <button
        onClick={handleCopy}
        className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-1 -m-1"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type IpMetaEntry = {
  interface?: string;
  family?: string;
  scope?: string;
  address?: string;
};

type DockerIpMetaEntry = {
  network?: string;
  family?: string;
  scope?: string;
  address?: string;
};

function isIpMetaEntry(v: unknown): v is IpMetaEntry {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.address === "string" &&
    (obj.interface === undefined || typeof obj.interface === "string") &&
    (obj.family === undefined || typeof obj.family === "string") &&
    (obj.scope === undefined || typeof obj.scope === "string")
  );
}

function isDockerIpMetaEntry(v: unknown): v is DockerIpMetaEntry {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.address === "string" &&
    (obj.network === undefined || typeof obj.network === "string") &&
    (obj.family === undefined || typeof obj.family === "string") &&
    (obj.scope === undefined || typeof obj.scope === "string")
  );
}

function renderIpMeta(entries: IpMetaEntry[]) {
  const filtered = entries
    .filter((e) => !!e.address)
    .map((e) => ({
      interface: e.interface ?? "unknown",
      family: e.family ?? "",
      scope: e.scope ?? "",
      address: e.address ?? "",
    }));

  const scopeRank: Record<string, number> = { global: 0, link: 1, local: 2 };
  const familyRank: Record<string, number> = { inet: 0, inet6: 1 };

  const grouped = new Map<string, typeof filtered>();
  for (const e of filtered) {
    const list = grouped.get(e.interface) ?? [];
    list.push(e);
    grouped.set(e.interface, list);
  }

  const interfaces = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
  for (const iface of interfaces) {
    grouped.get(iface)!.sort((a, b) => {
      const sr = (scopeRank[a.scope] ?? 99) - (scopeRank[b.scope] ?? 99);
      if (sr !== 0) return sr;
      const fr = (familyRank[a.family] ?? 99) - (familyRank[b.family] ?? 99);
      if (fr !== 0) return fr;
      return a.address.localeCompare(b.address);
    });
  }

  return (
    <div className="space-y-2">
      {interfaces.map((iface) => (
        <div key={iface}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {iface}
          </div>
          <ul className="mt-1 space-y-0.5">
            {grouped.get(iface)!.map((e, idx) => (
              <li key={`${iface}-${idx}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="break-all">{e.address}</span>
                {(e.family || e.scope) && (
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    ({[e.family, e.scope].filter(Boolean).join(" ")})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function renderDockerIpMeta(entries: DockerIpMetaEntry[]) {
  const filtered = entries
    .filter((e) => !!e.address)
    .map((e) => ({
      network: e.network ?? "unknown",
      family: e.family ?? "",
      scope: e.scope ?? "",
      address: e.address ?? "",
    }));

  const familyRank: Record<string, number> = { inet: 0, inet6: 1 };
  const scopeRank: Record<string, number> = { container: 0, global: 1, link: 2, local: 3 };

  const grouped = new Map<string, typeof filtered>();
  for (const e of filtered) {
    const list = grouped.get(e.network) ?? [];
    list.push(e);
    grouped.set(e.network, list);
  }

  const networks = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
  for (const net of networks) {
    grouped.get(net)!.sort((a, b) => {
      const fr = (familyRank[a.family] ?? 99) - (familyRank[b.family] ?? 99);
      if (fr !== 0) return fr;
      const sr = (scopeRank[a.scope] ?? 99) - (scopeRank[b.scope] ?? 99);
      if (sr !== 0) return sr;
      return a.address.localeCompare(b.address);
    });
  }

  return (
    <div className="space-y-2">
      {networks.map((net) => (
        <div key={net}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {net}
          </div>
          <ul className="mt-1 space-y-0.5">
            {grouped.get(net)!.map((e, idx) => (
              <li key={`${net}-${idx}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="break-all">{e.address}</span>
                {(e.family || e.scope) && (
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    ({[e.family, e.scope].filter(Boolean).join(" ")})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function renderKeyValueRecord(obj: Record<string, unknown>) {
  const entries = Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) return <span className="text-[hsl(var(--muted-foreground))]">—</span>;

  return (
    <div className="overflow-hidden rounded-md border border-[hsl(var(--border))]">
      <table className="w-full text-xs">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-b border-[hsl(var(--border))] last:border-0">
              <td className="w-1/3 bg-[hsl(var(--muted))] px-2 py-1.5 font-medium text-[hsl(var(--muted-foreground))] align-top">
                <span className="break-all">{k}</span>
              </td>
              <td className="px-2 py-1.5 align-top">
                {typeof v === "string" ? (
                  <span className="break-all">{v}</span>
                ) : (typeof v === "number" || typeof v === "boolean") ? (
                  <span>{String(v)}</span>
                ) : (
                  <pre className="whitespace-pre-wrap break-words">{JSON.stringify(v, null, 2)}</pre>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderDockerPorts(val: unknown) {
  // Docker inspect: NetworkSettings.Ports is an object like:
  // { "80/tcp": [ { HostIp, HostPort } ], "443/tcp": null }
  if (!isPlainRecord(val)) return null;
  const entries = Object.entries(val).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="overflow-hidden rounded-md border border-[hsl(var(--border))]">
      <table className="w-full text-xs">
        <tbody>
          {entries.map(([containerPort, bindings]) => {
            let rendered: React.ReactNode = <span className="text-[hsl(var(--muted-foreground))]">—</span>;

            if (Array.isArray(bindings)) {
              const rows = bindings
                .filter((b) => !!b && typeof b === "object")
                .map((b) => b as Record<string, unknown>)
                .map((b) => ({
                  hostIp: typeof b.HostIp === "string" ? b.HostIp : "",
                  hostPort: typeof b.HostPort === "string" ? b.HostPort : "",
                }))
                .filter((x) => x.hostIp || x.hostPort);

              if (rows.length > 0) {
                rendered = (
                  <div className="space-y-0.5">
                    {rows.map((r, idx) => (
                      <div key={idx} className="break-all">
                        {r.hostIp ? `${r.hostIp}:` : ""}{r.hostPort || "?"}
                      </div>
                    ))}
                  </div>
                );
              }
            } else if (bindings === null) {
              rendered = <span className="text-[hsl(var(--muted-foreground))]">not published</span>;
            }

            return (
              <tr key={containerPort} className="border-b border-[hsl(var(--border))] last:border-0">
                <td className="w-1/3 bg-[hsl(var(--muted))] px-2 py-1.5 font-medium text-[hsl(var(--muted-foreground))] align-top">
                  <span className="break-all">{containerPort}</span>
                </td>
                <td className="px-2 py-1.5 align-top">{rendered}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderMetaValue(key: string, val: unknown) {
  if (key === "ips" && Array.isArray(val)) {
    if (val.every(isIpMetaEntry)) return renderIpMeta(val);
    if (val.every(isDockerIpMetaEntry)) return renderDockerIpMeta(val);
  }

  if (typeof val === "string") return <span className="break-all">{val}</span>;
  if (typeof val === "number" || typeof val === "boolean") return <span>{String(val)}</span>;

  if (key === "labels" && isPlainRecord(val)) {
    return renderKeyValueRecord(val);
  }

  if (key === "ports") {
    const ports = renderDockerPorts(val);
    if (ports) return ports;
  }

  if (isPlainRecord(val)) {
    return renderKeyValueRecord(val);
  }

  return (
    <pre className="whitespace-pre-wrap break-words text-xs">
      {JSON.stringify(val, null, 2)}
    </pre>
  );
}

const kindColors: Record<string, string> = {
  device: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  site: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  service: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export function NodeDetailDialog({ open, onOpenChange, node, onEdit }: NodeDetailDialogProps) {
  const [parentNode, setParentNode] = useState<NodePublic | null>(null);
  const [children, setChildren] = useState<NodePublic[]>([]);
  const [relLoading, setRelLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRelations() {
      if (!open || !node) return;
      setRelLoading(true);
      setParentNode(null);
      setChildren([]);

      try {
        const [parentRes, childrenRes] = await Promise.all([
          node.parent_node_id ? api.nodes.get(node.team_id, node.parent_node_id).catch(() => null) : Promise.resolve(null),
          api.nodes.list(node.team_id, { parent_id: node.id, limit: 200 }).catch(() => []),
        ]);

        if (cancelled) return;
        setParentNode(parentRes);
        setChildren(childrenRes);
      } finally {
        if (!cancelled) setRelLoading(false);
      }
    }

    loadRelations();
    return () => { cancelled = true; };
  }, [open, node?.id, node?.team_id, node?.parent_node_id]);

  if (!open || !node) return null;

  const metaEntries = Object.entries(node.meta).filter(([, v]) => v !== null && v !== undefined);
  const parentHint = typeof (node.meta as Record<string, unknown>).parent_hostname === "string"
    ? String((node.meta as Record<string, unknown>).parent_hostname)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />

      <div className="relative z-50 mx-4 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-lg">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{node.name}</h2>
              <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${kindColors[node.kind] ?? kindColors.other}`}>
                {node.kind}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              Created {formatDate(node.created_at)}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onEdit(node); }}>
              Edit
            </Button>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-5 p-5">
          {/* Connection details */}
          {(node.hostname || node.ip || node.url) && (
            <div className="rounded-lg border border-[hsl(var(--border))] p-4 space-y-3">
              {node.hostname && (
                <Field label="Hostname">
                  <CopyableValue value={node.hostname} />
                </Field>
              )}
              {node.ip && (
                <Field label="IP Address">
                  <CopyableValue value={node.ip} />
                </Field>
              )}
              {node.url && (
                <Field label="URL">
                  <a
                    href={node.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {node.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Field>
              )}
            </div>
          )}

          {/* Tags */}
          {node.tags.length > 0 && (
            <Field label="Tags">
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {node.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </Field>
          )}

          {/* Notes */}
          {node.notes && (
            <Field label="Notes">
              <div className="mt-1 whitespace-pre-wrap rounded-md bg-[hsl(var(--muted))] p-3 text-sm leading-relaxed">
                {node.notes}
              </div>
            </Field>
          )}

          {/* Relationships */}
          {(relLoading || node.parent_node_id || parentHint || children.length > 0) && (
            <div className="rounded-lg border border-[hsl(var(--border))] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Relationships
                </div>
                {relLoading && <Spinner className="h-4 w-4" />}
              </div>

              {node.parent_node_id && (
                <Field label="Parent">
                  {parentNode ? (
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{parentNode.name}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">
                        {parentNode.hostname ?? parentNode.ip ?? parentNode.id}
                      </div>
                    </div>
                  ) : (
                    <CopyableValue value={node.parent_node_id} />
                  )}
                </Field>
              )}

              {!node.parent_node_id && parentHint && (
                <Field label="Parent (hint)">
                  <CopyableValue value={parentHint} />
                </Field>
              )}

              {children.length > 0 && (
                <Field label={`Children (${children.length})`}>
                  <div className="mt-1 overflow-hidden rounded-md border border-[hsl(var(--border))]">
                    <table className="w-full text-sm">
                      <tbody>
                        {children.map((c) => (
                          <tr key={c.id} className="border-b border-[hsl(var(--border))] last:border-0">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{c.name}</span>
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${kindColors[c.kind] ?? kindColors.other}`}>
                                  {c.kind}
                                </span>
                              </div>
                              {(c.hostname || c.ip) && (
                                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                                  {c.hostname ?? c.ip}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  onOpenChange(false);
                                  onEdit(c);
                                }}
                              >
                                Edit
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Field>
              )}
            </div>
          )}

          {/* Meta */}
          {metaEntries.length > 0 && (
            <Field label="Metadata">
              <div className="mt-1 overflow-hidden rounded-md border border-[hsl(var(--border))]">
                <table className="w-full text-sm">
                  <tbody>
                    {metaEntries.map(([key, val]) => (
                      <tr key={key} className="border-b border-[hsl(var(--border))] last:border-0">
                        <td className="px-3 py-2 font-medium text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] w-1/3">{key}</td>
                        <td className="px-3 py-2 font-mono text-xs align-top">{renderMetaValue(key, val)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Field>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 rounded-lg bg-[hsl(var(--muted))] p-4 text-xs">
            <div>
              <div className="font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Created</div>
              <div className="mt-1">{formatDate(node.created_at)}</div>
            </div>
            <div>
              <div className="font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Updated</div>
              <div className="mt-1">{formatDate(node.updated_at)}</div>
            </div>
            {node.last_seen_at && (
              <div>
                <div className="font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Last seen</div>
                <div className="mt-1">{formatDate(node.last_seen_at)}{node.last_seen_source ? ` (${node.last_seen_source})` : ""}</div>
              </div>
            )}
            <div>
              <div className="font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">ID</div>
              <div className="mt-1 font-mono truncate" title={node.id}>{node.id}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
