"use client";

import type { Item } from "@clf/shared";
import { useQuery } from "@tanstack/react-query";
import { MailIcon } from "lucide-react";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { CONTACT_STATUSES } from "@/lib/contact-statuses";
import { apiFetch } from "@/lib/errors";
import type { ViewerRole } from "@/lib/item-actions";
import { NodeDot } from "./node-dot";

const contactSchema = z.object({
  email: z.string(),
  party: z.enum(["owner", "finder"]),
  address: z.string(),
});

/**
 * After a claim, the owner and the finder see each other's college email to arrange the
 * return (`GET /api/items/[id]/contact`, which re-checks both and logs the reveal).
 */
export function ContactCard({ item, role }: { item: Item; role: ViewerRole }) {
  const allowed =
    (role === "owner" || role === "finder") &&
    CONTACT_STATUSES.includes(item.status) &&
    item.finder !== null;
  const contact = useQuery({
    queryKey: ["contact", item.id.toString(), item.finder],
    queryFn: async () =>
      contactSchema.parse(
        await apiFetch(`/api/items/${item.id}/contact`, { cache: "no-store" }),
      ),
    enabled: allowed,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  if (!allowed) return null;
  const other = role === "owner" ? "finder" : "owner";

  return (
    <section
      aria-labelledby="contact-title"
      className="flex flex-col gap-9 rounded-card border border-charcoal bg-carbon p-24"
    >
      <h2
        id="contact-title"
        className="font-mono text-caption text-cloud uppercase"
      >
        Contact the {other}
      </h2>
      {contact.isPending ? (
        <Skeleton className="h-24 w-240 max-w-full" />
      ) : contact.isError ? (
        <p className="flex items-start gap-9 text-body-sm text-snow">
          <NodeDot tone="magenta" className="mt-5" />
          <span>{contact.error.message}</span>
        </p>
      ) : (
        <>
          <a
            href={`mailto:${contact.data.email}`}
            className="inline-flex w-fit max-w-full items-center gap-9 text-body break-all text-white underline underline-offset-4"
          >
            <MailIcon aria-hidden="true" className="size-16 shrink-0" />
            {contact.data.email}
          </a>
          <p className="text-body-sm text-cloud">
            {role === "owner"
              ? "Email the finder to arrange the return. Confirm only once you have the item."
              : "Email the owner to arrange the return. You're paid when they confirm."}
          </p>
        </>
      )}
    </section>
  );
}
