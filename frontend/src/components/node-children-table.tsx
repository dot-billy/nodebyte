"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from "lucide-react";
import type { NodePublic } from "@/lib/api";
import { sortNodes, type NodeSort, type NodeSortKey } from "@/lib/node-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function ConnectionLink({ value }: { value: string }) {
  let href: string | null = null;
  try {
    const trimmed = value.trim();
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) href = url.href;
  } catch { /* Invalid addresses remain readable. */ }
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-blue-600 hover:underline dark:text-blue-400">
      <span className="break-all">{value}</span><ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
    </a>
  ) : <span className="break-all">{value}</span>;
}

export function NodeDate({ value }: { value: string | null }) {
  if (!value) return <span className="text-[hsl(var(--muted-foreground))]">—</span>;
  const date = new Date(value);
  return <time dateTime={value} title={date.toLocaleString()} className="whitespace-nowrap">
    {date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
    <span className="block text-xs text-[hsl(var(--muted-foreground))]">
      {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
    </span>
  </time>;
}

export function NodeChildrenTable({ nodes, onView, onEdit }: {
  nodes: NodePublic[];
  onView: (node: NodePublic) => void;
  onEdit: (node: NodePublic) => void;
}) {
  const [sort, setSort] = useState<NodeSort>({ key: "name", direction: "asc" });
  const [tag, setTag] = useState("");
  const tags = useMemo(() => [...new Set(nodes.flatMap((node) => node.tags))].sort(), [nodes]);
  const rows = useMemo(() => sortNodes(tag ? nodes.filter((node) => node.tags.includes(tag)) : nodes, sort), [nodes, tag, sort]);

  function sortHeader(key: NodeSortKey, label: string) {
    const active = sort.key === key;
    const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-3 text-left font-medium">
      <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap hover:underline"
        onClick={() => setSort({ key, direction: active && sort.direction === "asc" ? "desc" : active ? "asc" : key.endsWith("_at") ? "desc" : "asc" })}>
        {label}<Icon aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </th>;
  }

  return <section aria-label="Child nodes" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold">Children ({nodes.length})</h3>
      <label className="flex items-center gap-2 text-sm">
        Filter by tag
        <select value={tag} onChange={(event) => setTag(event.target.value)} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5">
          <option value="">All tags</option>
          {tags.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </div>
    <p className="text-xs text-[hsl(var(--muted-foreground))]">
      Date added and Date updated track NodeByte records. Document dates are supplied from the source. Times use your local timezone.
      {sort.key === "tags" && " Tags sort alphabetically by each node’s sorted tag list; untagged nodes appear last."}
    </p>
    <div role="region" aria-label="Scrollable children table" tabIndex={0} className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
      <table className="w-full min-w-[1100px] text-sm">
        <caption className="sr-only">Child nodes with descriptions, tags and record and document dates. Select a column header to sort.</caption>
        <thead className="bg-[hsl(var(--muted))]">
          <tr>
            {sortHeader("name", "Name")}
            <th scope="col" className="px-3 py-3 text-left font-medium">Description</th>
            {sortHeader("tags", "Tags")}
            {sortHeader("created_at", "Date added")}
            {sortHeader("updated_at", "Date updated")}
            {sortHeader("document_created_at", "Document created")}
            {sortHeader("document_updated_at", "Document updated")}
            <th scope="col" className="px-3 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((node) => <tr key={node.id} className="border-t border-[hsl(var(--border))] align-top hover:bg-[hsl(var(--muted))]/40">
            <td className="min-w-48 max-w-72 px-3 py-3">
              <button type="button" onClick={() => onView(node)} className="text-left font-medium text-blue-600 hover:underline dark:text-blue-400">{node.name}</button>
              <div className="my-1"><Badge variant="outline">{node.kind}</Badge></div>
              {node.hostname && <div className="text-xs"><ConnectionLink value={node.hostname} /></div>}
              {node.ip && <div className="break-all text-xs text-[hsl(var(--muted-foreground))]">{node.ip}</div>}
              {node.url && <div className="mt-1 text-xs"><ConnectionLink value={node.url} /></div>}
            </td>
            <td className="min-w-52 max-w-80 px-3 py-3">
              <p className="whitespace-pre-wrap break-words text-[hsl(var(--muted-foreground))]">{node.notes || "—"}</p>
            </td>
            <td className="min-w-36 px-3 py-3"><div className="flex flex-wrap gap-1">
              {node.tags.length ? [...node.tags].sort().map((value) => <Badge key={value} variant="secondary">{value}</Badge>) : "—"}
            </div></td>
            <td className="px-3 py-3"><NodeDate value={node.created_at} /></td>
            <td className="px-3 py-3"><NodeDate value={node.updated_at} /></td>
            <td className="px-3 py-3"><NodeDate value={node.document_created_at} /></td>
            <td className="px-3 py-3"><NodeDate value={node.document_updated_at} /></td>
            <td className="px-3 py-3 text-right"><Button type="button" size="sm" variant="outline" onClick={() => onEdit(node)}>Edit</Button></td>
          </tr>)}
          {!rows.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-[hsl(var(--muted-foreground))]">{tag ? "No children match this tag." : "No child nodes yet."}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
