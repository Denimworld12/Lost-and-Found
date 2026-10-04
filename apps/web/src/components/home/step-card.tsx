import { cn } from "@/lib/utils";

/** Orange StepCard: numbered step on Signal Orange with Abyss text. */
export function StepCard({
  step,
  tag,
  title,
  children,
  className,
}: {
  step: number;
  tag: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-16 rounded-card bg-signal-orange p-24 text-abyss",
        className,
      )}
    >
      <div className="flex items-center gap-12">
        <span
          aria-hidden="true"
          className="flex size-36 items-center justify-center rounded-badge bg-white font-clash text-body font-semibold text-abyss"
        >
          {step}
        </span>
        <span className="font-mono text-caption text-abyss/75 uppercase">
          {tag}
        </span>
      </div>
      <h3 className="text-heading-sm text-abyss">
        <span className="sr-only">Step {step}: </span>
        {title}
      </h3>
      <div className="text-body text-abyss/80">{children}</div>
    </li>
  );
}
