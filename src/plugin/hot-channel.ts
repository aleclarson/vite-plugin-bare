import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type {
  HotChannel,
  HotChannelClient,
  HotChannelListener,
  HotPayload,
} from 'vite'
import { WebSocketServer, type WebSocket } from 'ws'
import { BARE_ENVIRONMENT, BARE_WS_PATH } from '../core/constants.js'

type Listener = HotChannelListener<string>

export class BareHotChannel implements HotChannel {
  readonly path: string
  readonly clients = new Map<WebSocket, HotChannelClient>()
  readonly #listeners = new Map<string, Set<Listener>>()
  readonly #webSocketServer = new WebSocketServer({ noServer: true })
  #removeUpgradeListener: (() => void) | undefined

  constructor(path = BARE_WS_PATH) {
    this.path = path
    this.#webSocketServer.on('connection', (socket) => this.#connect(socket))
  }

  attach(server: import('node:http').Server | import('node:http2').Http2SecureServer): void {
    if (this.#removeUpgradeListener) return

    const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(request.url ?? '/', 'http://bare-vite.local')
      if (
        url.pathname !== this.path ||
        url.searchParams.get('environment') !== BARE_ENVIRONMENT
      ) {
        return
      }
      this.#webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        this.#webSocketServer.emit('connection', webSocket, request)
      })
    }

    server.on('upgrade', onUpgrade)
    this.#removeUpgradeListener = () => server.off('upgrade', onUpgrade)
  }

  on(event: string, listener: Listener): void {
    let listeners = this.#listeners.get(event)
    if (!listeners) this.#listeners.set(event, (listeners = new Set()))
    listeners.add(listener)
  }

  off(event: string, listener: Function): void {
    this.#listeners.get(event)?.delete(listener as Listener)
  }

  send(payload: HotPayload): void {
    const encoded = JSON.stringify(payload)
    for (const socket of this.clients.keys()) {
      if (socket.readyState === socket.OPEN) socket.send(encoded)
    }
  }

  close(): void {
    this.#removeUpgradeListener?.()
    this.#removeUpgradeListener = undefined
    for (const socket of this.clients.keys()) socket.close(1001, 'Vite server closed')
    this.clients.clear()
    this.#webSocketServer.close()
  }

  #connect(socket: WebSocket): void {
    const client: HotChannelClient = {
      send: (payload) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload))
      },
    }
    this.clients.set(socket, client)

    socket.on('message', (raw) => {
      let payload: unknown
      try {
        payload = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (
        payload &&
        typeof payload === 'object' &&
        'type' in payload &&
        payload.type === 'custom' &&
        'event' in payload &&
        typeof payload.event === 'string'
      ) {
        this.#emit(payload.event, 'data' in payload ? payload.data : undefined, client)
      }
    })
    socket.on('close', () => {
      this.clients.delete(socket)
      this.#emit('vite:client:disconnect', undefined, client)
    })
    socket.on('error', () => {
      // The close event owns cleanup and environment notification.
    })

    this.#emit('vite:client:connect', undefined, client)
    client.send({ type: 'connected' })
  }

  #emit(event: string, data: unknown, client: HotChannelClient): void {
    for (const listener of this.#listeners.get(event) ?? []) listener(data, client)
  }
}
