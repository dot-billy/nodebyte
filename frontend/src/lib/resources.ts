import { api, type CollectionPublic, type NodePublic } from "@/lib/api";

export const KNOWLEDGE_KINDS = ["document", "channel", "link"];
export const isKnowledge = (node: Pick<NodePublic, "kind">) =>
  KNOWLEDGE_KINDS.includes(node.kind);
export const resourceHref = (node: Pick<NodePublic, "id" | "kind">) =>
  `/dashboard/${isKnowledge(node) ? "knowledge" : "inventory"}?resource=${node.id}`;

export function safeResourceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function loadCollections(
  teamId: string,
  nodeId?: string,
  cancelled = () => false,
): Promise<CollectionPublic[]> {
  const result: CollectionPublic[] = [];
  for (let offset = 0; !cancelled(); offset += 200) {
    const page = await api.collections.list(teamId, {
      node_id: nodeId,
      limit: 200,
      offset,
    });
    if (cancelled()) return [];
    result.push(...page);
    if (page.length < 200) break;
  }
  return result;
}

export const resourceError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
