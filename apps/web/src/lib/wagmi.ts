import {
  cookieStorage,
  createConfig,
  createStorage,
  http,
  injected,
  type Transport,
} from "wagmi";
import { appChain, rpcUrl } from "./chain";

/**
 * wagmi config: the app chain only, the injected (MetaMask) connector, and cookie storage so
 * the server render matches the client (`ssr: true` + `cookieToInitialState` in the root layout).
 */
export function getWagmiConfig() {
  return createConfig({
    chains: [appChain],
    connectors: [injected()],
    // Only the app chain is configured, so only its transport exists.
    transports: { [appChain.id]: http(rpcUrl(), { batch: true }) } as Record<
      typeof appChain.id,
      Transport
    >,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getWagmiConfig>;
  }
}
