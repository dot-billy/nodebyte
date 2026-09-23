import type { NodePublic } from "@/lib/api";

export type NodeSortKey = "name" | "tags" | "created_at" | "updated_at" | "document_created_at" | "document_updated_at";
export type NodeSort = { key: NodeSortKey; direction: "asc" | "desc" };

export function sortNodes(nodes: NodePublic[], sort: NodeSort): NodePublic[] {
  const text = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  function value(node: NodePublic): string | number | null {
    if (sort.key === "name") return node.name;
    if (sort.key === "tags") return [...node.tags].sort(text).join(", ") || null;
    const date = node[sort.key];
    const time = date ? Date.parse(date) : NaN;
    return Number.isFinite(time) ? time : null;
  }
  return [...nodes].sort((a, b) => {
    const av = value(a), bv = value(b);
    // Unknown dates and untagged nodes stay last in either direction.
    if (av === null && bv !== null) return 1;
    if (bv === null && av !== null) return -1;
    const result = av === null || bv === null ? 0
      : typeof av === "number" && typeof bv === "number" ? av - bv
      : text(String(av), String(bv));
    return result * (sort.direction === "asc" ? 1 : -1) || text(a.name, b.name) || text(a.id, b.id);
  });
}

export async function loadAllNodePages(
  fetchPage: (params: { limit: number; offset: number }) => Promise<NodePublic[]>,
  cancelled: () => boolean = () => false,
): Promise<NodePublic[]> {
  const nodes = new Map<string, NodePublic>();
  for (let offset = 0; !cancelled(); offset += 200) {
    const page = await fetchPage({ limit: 200, offset });
    if (cancelled()) return [];
    for (const node of page) nodes.set(node.id, node);
    if (page.length < 200) break;
  }
  return [...nodes.values()];
}

export function toLocalDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 23);
}

export function documentDatePayload(value: string, original: string | null | undefined): string | null {
  // Preserve original timezone/precision when the user edits another field.
  if (value === toLocalDateInput(original)) return original ?? null;
  return value ? new Date(value).toISOString() : null;
}
