import { dark } from "@clerk/ui/themes";

/**
 * Clerk components themed per docs/UI_SPEC.md → "Clerk theming". Clerk Core 3 renamed some
 * variables (`baseTheme` → `theme`, `colorText` → `colorForeground`, `colorInputBackground` →
 * `colorInput`, …); the values are the spec's. Element classes use our Tailwind tokens.
 */
export const clerkAppearance = {
  theme: dark,
  variables: {
    colorPrimary: "#ff6314",
    colorPrimaryForeground: "#04070a",
    colorBackground: "#090c0f",
    colorInput: "#0f1214",
    colorInputForeground: "#f0f5fa",
    colorForeground: "#ffffff",
    colorMutedForeground: "#c6ced7",
    colorDanger: "#ff2ad4",
    colorSuccess: "#33ffac",
    colorNeutral: "#f0f5fa",
    borderRadius: "8px",
    fontFamily: "var(--font-inter)",
  },
  elements: {
    card: "bg-carbon border border-charcoal shadow-none",
    headerTitle: "font-clash tracking-clash",
    formButtonPrimary:
      "rounded-pill uppercase font-clash tracking-clash shadow-none",
    socialButtonsBlockButton: "rounded-pill border border-steel bg-transparent",
    formFieldInput: "rounded-pill border border-charcoal",
    footer: "bg-carbon",
  },
};
