import { once } from "node:events"
import { createServer } from "node:http"

import { describe, expect, it, vi } from "vitest"
import WebSocket from "ws"

import { BareHotChannel } from "../src/plugin/hot-channel.js"

describe("BareHotChannel", () => {
  it("emits Vite connection events and broadcasts payloads", async () => {
    const server = createServer()
    const channel = new BareHotChannel()

    channel.attach(server)
    server.listen(0, "127.0.0.1")
    await once(server, "listening")
    const address = server.address()

    if (!address || typeof address === "string") throw new Error("Missing port")

    const connected = vi.fn()

    channel.on("vite:client:connect", connected)
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/__bare_vite?environment=bare`)

    const firstMessage = once(socket, "message")

    await once(socket, "open")
    expect(JSON.parse(String((await firstMessage)[0]))).toEqual({ type: "connected" })
    expect(connected).toHaveBeenCalledOnce()

    const update = once(socket, "message")

    channel.send({ type: "full-reload" })
    expect(JSON.parse(String((await update)[0]))).toEqual({ type: "full-reload" })

    socket.close()
    await once(socket, "close")
    channel.close()
    server.close()
  })
})
