import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our custom theme keys, otherwise it reads `text-caption` as a color
// and drops it when merged with `text-cloud`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "caption",
        "body-sm",
        "body",
        "body-lg",
        "subheading",
        "heading-sm",
        "heading",
        "heading-lg",
        "display",
        "display-mobile",
      ],
      radius: ["pill", "card", "badge", "chip"],
      shadow: ["subtle", "subtle-2"],
      font: ["clash", "sans", "mono"],
      tracking: ["clash"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
