import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ItemDetail } from "@/components/item/item-detail";
import { STATUS_META } from "@/components/item/status";
import { formatEth } from "@/lib/format";
import { getItem } from "@/lib/graph";
import { fetchMetadata, ipfsUrl } from "@/lib/ipfs";

/** Item IDs are positive integers; anything else is a 404 without touching the chain. */
const loadItem = cache(async (id: string) => {
  if (!/^[1-9]\d{0,19}$/.test(id)) return null;
  return getItem(BigInt(id));
});

export async function generateMetadata({
  params,
}: PageProps<"/items/[id]">): Promise<Metadata> {
  const { id } = await params;
  const item = await loadItem(id);
  if (!item) return { title: "Item not found" };

  let title = `Item #${id}`;
  let image: string | null = null;
  try {
    // Short wait: a slow gateway shouldn't hold up the page title.
    const metadata = await fetchMetadata(
      item.metadataCID,
      AbortSignal.timeout(2_500),
    );
    title = metadata.title;
    image = metadata.image ? ipfsUrl(metadata.image) : null;
  } catch {
    // Fall back to the item number.
  }
  const description = `${STATUS_META[item.status].label}. Reward ${formatEth(item.reward)}. Every payment is public on Sepolia.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const { id } = await params;
  const item = await loadItem(id);
  if (!item) notFound();
  return <ItemDetail initialItem={item} />;
}
