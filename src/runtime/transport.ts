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

export interface BareViteTransportOptions {
  url: string
  reconnectDelay?: number
  createSocket?: (url: string) => BareSocket
  onPayload?: (payload: HotPayload) => void | Promise<void>
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
