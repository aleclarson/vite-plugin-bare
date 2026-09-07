import type {
  ModuleRunnerTransport,
  ModuleRunnerTransportHandlers,
} from 'vite/module-runner'
import type { HotPayload } from 'vite'

export interface BareSocket {
  destroyed: boolean
  on(event: 'data', listener: (data: unknown) => void): this
  on(event: 'close', listener: () => void): this
  on(event: 'error', listener: (error: Error) => void): this
  write(data: string): boolean
  end(): void
}

/** Low-level controls for the Bare-to-Vite module-runner connection. */
export interface BareViteTransportOptions {
  /**
   * Full WebSocket endpoint, including the Bare environment query parameter.
   */
  url: string
  /**
   * Delay in milliseconds before reconnecting after an unexpected close.
   *
   * @defaultValue `500`
   */
  reconnectDelay?: number
  /**
   * Creates the transport socket. Primarily useful for alternate Bare socket
   * implementations and deterministic tests.
   *
   * @defaultValue A `bare-ws` socket.
   */
  createSocket?: (url: string) => BareSocket
  /**
   * Observes each decoded Vite payload before it reaches `ModuleRunner`.
   * Returning a promise does not delay delivery to `ModuleRunner`.
   */
  onPayload?: (payload: HotPayload) => void | Promise<void>
  /** Receives socket errors and invalid JSON payload errors. */
  onError?: (error: Error) => void
}

export function createBareViteTransport(
  options: BareViteTransportOptions,
): ModuleRunnerTransport {
  const createSocket = options.createSocket
  const reconnectDelay = options.reconnectDelay ?? 500
  let socket: BareSocket | undefined
  let handlers: ModuleRunnerTransportHandlers | undefined
  let stopped = false
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined

  const connectSocket = async () => {
    if (stopped || !handlers) return
    const current = createSocket
      ? createSocket(options.url)
      : (new (await import('bare-ws')).Socket(options.url) as unknown as BareSocket)
    socket = current

    current.on('data', (raw) => {
      try {
        const payload = JSON.parse(String(raw)) as HotPayload
        void options.onPayload?.(payload)
        handlers?.onMessage(payload)
      } catch (error) {
        options.onError?.(asError(error))
      }
    })
    current.on('error', (error) => options.onError?.(error))
    current.on('close', () => {
      if (socket !== current) return
      socket = undefined
      handlers?.onDisconnection()
      if (!stopped) reconnectTimer = setTimeout(() => void connectSocket(), reconnectDelay)
    })
  }

  return {
    async connect(nextHandlers) {
      handlers = nextHandlers
      stopped = false
      await connectSocket()
    },
    send(payload) {
      if (!socket || socket.destroyed) {
        throw new Error('Bare Vite transport is disconnected')
      }
      socket.write(JSON.stringify(payload))
    },
    disconnect() {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = undefined
      socket?.end()
      socket = undefined
    },
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
