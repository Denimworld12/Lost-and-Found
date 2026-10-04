"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during the server render and hydration, true after. For output that depends on the visitor's clock or time zone. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
