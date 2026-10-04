import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import {
  AnnouncementBar,
  announcementScript,
} from "@/components/layout/announcement-bar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SetupBanner } from "@/components/layout/setup-banner";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { Providers } from "@/components/providers";
import { NetworkGuard } from "@/components/tx/network-guard";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { getWagmiConfig } from "@/lib/wagmi";
import { clashGrotesk, dmMono, inter } from "./fonts";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: {
    default: "Campus Lost & Found",
    template: "%s — Campus Lost & Found",
  },
  description:
    "Post a lost item with a reward locked in escrow on Ethereum Sepolia. The finder is paid when you confirm it's back.",
  applicationName: "Campus Lost & Found",
};

export const viewport: Viewport = {
  themeColor: "#04070a",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initialState = cookieToInitialState(
    getWagmiConfig(),
    (await headers()).get("cookie"),
  );
  return (
    <html
      lang="en"
      className={`${clashGrotesk.variable} ${inter.variable} ${dmMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: announcementScript }} />
      </head>
      <body className="flex min-h-dvh flex-col pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        <ClerkProvider
          appearance={clerkAppearance}
          signInUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "/sign-in"}
          signUpUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || "/sign-up"}
          signUpForceRedirectUrl={
            process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL ||
            "/onboarding"
          }
        >
          <Providers initialState={initialState}>
            <SkipLink />
            <AnnouncementBar />
            <SiteHeader />
            <SetupBanner />
            <NetworkGuard />
            <main
              id="main"
              tabIndex={-1}
              className="flex flex-1 flex-col outline-none"
            >
              {children}
            </main>
            <SiteFooter />
            <BottomNav />
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
