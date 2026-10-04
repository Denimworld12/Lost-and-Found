"use client";

import { toast } from "sonner";
import { NodeDot } from "@/components/item/node-dot";
import type { NodeTone } from "@/components/item/status";

export type ToastResult = "success" | "error" | "cancelled" | "info";

const TONE: Record<ToastResult, NodeTone> = {
  success: "green",
  error: "magenta",
  cancelled: "steel",
  info: "cyan",
};

/** A toast with a node dot by result: Green success, Magenta error, Steel cancelled. */
export function toastResult(result: ToastResult, message: string) {
  toast(message, { icon: <NodeDot tone={TONE[result]} /> });
}
