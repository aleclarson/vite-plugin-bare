import type { HotPayload } from "vite"

export interface BareRuntimeStatus {
  type: "connected" | "application-started" | "application-restarted" | "error"
  message?: string
}

export interface WorkletRestartRequired {
  type: "worklet-restart-required"
  files: string[]
  reason: string
}

export type BareViteWirePayload = HotPayload | BareRuntimeStatus | WorkletRestartRequired

export function encodePayload(payload: BareViteWirePayload): string {
  return JSON.stringify(payload)
}

export function decodePayload(source: string): BareViteWirePayload {
  const payload: unknown = JSON.parse(source)

  if (!payload || typeof payload !== "object" || !("type" in payload)) {
    throw new TypeError("Invalid Bare Vite transport payload")
  }

  return payload as BareViteWirePayload
}
