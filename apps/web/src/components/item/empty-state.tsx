import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LatticeGlyph } from "./lattice-glyph";

/** EmptyState: lattice fragment, one Clash 21px line, optional detail, one button. */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-20 rounded-card border border-charcoal bg-carbon px-24 py-48 text-center",
        className,
      )}
    >
      <LatticeGlyph />
      <p className="max-w-480 font-clash text-subheading font-medium tracking-clash text-white">
        {title}
      </p>
      {children && (
        <div className="max-w-480 text-body-sm text-cloud">{children}</div>
      )}
      {action}
    </div>
  );
}
