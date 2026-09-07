import { EventEmitter } from "node:events"

import type { HotPayload } from "vite"
import { describe, expect, it, vi } from "vitest"

import { createBareViteTransport, type BareSocket } from "../src/runtime/transport.js"

class FakeSocket extends EventEmitter implements BareSocket {
  destroyed = false
  writes: string[] = []

  write(data: string): boolean {
    this.writes.push(data)
    return true
  }

  end(): void {
    this.destroyed = true
    this.emit("close")
  }
}

describe("Bare module-runner transport", () => {
  it("carries JSON messages in both directions", () => {
    const socket = new FakeSocket()
    const onMessage = vi.fn()
    const transport = createBareViteTransport({
      url: "ws://device.test/__bare_vite?environment=bare",
      createSocket: () => socket,
    })

    transport.connect?.({
      onMessage,
      onDisconnection: vi.fn(),
    })

    const payload: HotPayload = { type: "full-reload" }

    transport.send?.(payload)
    socket.emit("data", Buffer.from(JSON.stringify({ type: "connected" })))

    expect(socket.writes).toEqual([JSON.stringify(payload)])
    expect(onMessage).toHaveBeenCalledWith({ type: "connected" })
  })
})
