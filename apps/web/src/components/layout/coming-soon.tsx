import Link from "next/link";
import { EmptyState } from "@/components/item/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Placeholder for verified-student routes built in Phase 8, so links from the shell and the
 * bottom nav land somewhere useful instead of a 404.
 */
export function ComingSoon({
  heading,
  title,
  children,
}: {
  heading: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-x flex flex-col gap-24 py-48">
      <h1 className="text-heading-sm md:text-heading">{heading}</h1>
      <EmptyState
        title={title}
        action={
          <Button asChild>
            <Link href="/items">Browse items</Link>
          </Button>
        }
      >
        {children}
      </EmptyState>
    </div>
  );
}
