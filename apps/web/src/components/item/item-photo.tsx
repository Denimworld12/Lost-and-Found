import Image from "next/image";
import { ipfsUrl } from "@/lib/ipfs";
import { cn } from "@/lib/utils";
import { LatticeGlyph } from "./lattice-glyph";

/**
 * 4:3 photo on a Void letterbox, radius 4. Without a photo it shows a lattice placeholder
 * and a short note instead.
 */
export function ItemPhoto({
  image,
  localSrc,
  alt,
  note,
  sizes,
  priority = false,
  dimmed = false,
  className,
}: {
  image?: string;
  /** A local `blob:` preview (post wizard) shown instead of an IPFS photo. */
  localSrc?: string;
  alt: string;
  /** Shown when there is no photo. */
  note: string;
  sizes: string;
  priority?: boolean;
  dimmed?: boolean;
  className?: string;
}) {
  const src = localSrc ?? (image ? ipfsUrl(image) : null);
  return (
    <div
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden rounded-chip bg-void",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={Boolean(localSrc)}
          className={cn("object-contain", dimmed && "opacity-70")}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-12 border border-charcoal bg-obsidian px-16 text-center">
          <LatticeGlyph className="h-40 w-76" />
          <p className="text-caption text-cloud">{note}</p>
        </div>
      )}
    </div>
  );
}
