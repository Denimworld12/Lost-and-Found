import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const isLocalChain = process.env.NEXT_PUBLIC_CHAIN_ID === "31337";

/** Origin (`https://host`) of a URL-valued env var, or null if unset or invalid. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Pinata gateway host; mirrors `pinataGateway()` in src/lib/ipfs.ts. */
const pinataGateway =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "") || "gateway.pinata.cloud";

const siteHost = originOf(process.env.NEXT_PUBLIC_SITE_URL)?.replace(
  /^https?:\/\//,
  "",
);

// Clerk (Phase 7): development instances live on *.clerk.accounts.dev; a production instance
// serves its Frontend API from clerk.<your domain>.
const clerk = [
  "https://*.clerk.accounts.dev",
  siteHost ? `https://clerk.${siteHost}` : null,
];

const rpc = [
  originOf(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://*.alchemy.com",
  "wss://*.alchemy.com",
  isLocalChain ? "http://127.0.0.1:8545" : null,
  isLocalChain ? "http://localhost:8545" : null,
];

const subgraph = [
  originOf(process.env.NEXT_PUBLIC_SUBGRAPH_URL),
  "https://api.studio.thegraph.com",
  "https://gateway.thegraph.com",
];

const sources = (...values: (string | null | undefined)[]) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].join(
    " ",
  );

const csp = [
  `default-src 'self'`,
  // Next.js inlines bootstrap scripts; dev mode also needs eval for React Refresh.
  `script-src ${sources("'self'", "'unsafe-inline'", isDev ? "'unsafe-eval'" : null, ...clerk, "https://challenges.cloudflare.com")}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src ${sources("'self'", "data:", "blob:", `https://${pinataGateway}`, "https://img.clerk.com")}`,
  `font-src 'self' data:`,
  `connect-src ${sources("'self'", isDev ? "ws://localhost:*" : null, ...rpc, `https://${pinataGateway}`, ...subgraph, ...clerk, "https://clerk-telemetry.com")}`,
  `frame-src https://challenges.cloudflare.com`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  !isDev && !isLocalChain ? "upgrade-insecure-requests" : null,
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source.
  transpilePackages: ["@milgaya/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: pinataGateway, pathname: "/ipfs/**" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
