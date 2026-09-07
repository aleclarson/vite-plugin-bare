export interface BareErrorEmitter {
  on(event: "uncaughtException", listener: (error: Error) => void): unknown
  on(event: "unhandledRejection", listener: (reason: unknown) => void): unknown
}

export interface SerializedRuntimeError {
  kind: "uncaughtException" | "unhandledRejection"
  name: string
  message: string
  stack?: string
}

export function installBareErrorHandlers(
  bare: BareErrorEmitter,
  report: (error: SerializedRuntimeError) => void,
): void {
  const serialize = (
    kind: SerializedRuntimeError["kind"],
    value: unknown,
  ): SerializedRuntimeError => {
    const error = value instanceof Error ? value : new Error(String(value))

    return {
      kind,
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }

  bare.on("uncaughtException", (error) => report(serialize("uncaughtException", error)))
  bare.on("unhandledRejection", (reason) => report(serialize("unhandledRejection", reason)))
}
