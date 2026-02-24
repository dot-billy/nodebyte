"use client";

import { ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { NodePublic } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NodeDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodePublic | null;
  onEdit: (node: NodePublic) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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

function renderMetaValue(key: string, val: unknown) {
  if (key === "ips" && Array.isArray(val) && val.every(isIpMetaEntry)) {
    return renderIpMeta(val);
  }

  if (typeof val === "string") return <span className="break-all">{val}</span>;
  if (typeof val === "number" || typeof val === "boolean") return <span>{String(val)}</span>;

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
  if (!open || !node) return null;

  const metaEntries = Object.entries(node.meta).filter(([, v]) => v !== null && v !== undefined);

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
