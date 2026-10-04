import type { ReactNode } from "react";
import { LatticeGlyph } from "@/components/item/lattice-glyph";
import { displayDomain } from "@/lib/session";

/** Sign-in / sign-up frame: explainer panel (left on desktop) and the Clerk card. */
export function AuthLayout({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  const domain = displayDomain(process.env.ALLOWED_EMAIL_DOMAIN);
  return (
    <div className="page-x grid flex-1 items-center gap-32 py-48 md:grid-cols-2 md:gap-64">
      <div className="relative flex flex-col gap-16">
        <LatticeGlyph className="opacity-60" />
        <h1 className="text-heading-sm md:text-heading">{heading}</h1>
        <p className="max-w-480 text-body text-cloud">
          Use your college Google account.{" "}
          {domain
            ? `Only @${domain} addresses can join.`
            : "Only college email addresses can join."}
        </p>
      </div>
      <div className="flex justify-center md:justify-start">{children}</div>
    </div>
  );
}
