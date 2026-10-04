import { DM_Mono, Inter } from "next/font/google";
import localFont from "next/font/local";

/** Clash Grotesk 500/600 from Fontshare (ITF Free Font License), self-hosted. */
export const clashGrotesk = localFont({
  src: [
    {
      path: "../fonts/ClashGrotesk-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/ClashGrotesk-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-clashgrotesk",
  display: "swap",
  fallback: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});
