import { ResourceWorkspace } from "@/components/resource-workspace";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResourceWorkspace view="collection" collectionId={id} />;
}
