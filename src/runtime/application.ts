import type { ModuleRunner } from "vite/module-runner"

export interface BareApplicationModule<Context = unknown> {
  start?: (context: Context) => unknown | Promise<unknown>
  dispose?: () => unknown | Promise<unknown>
}

export class BareApplication<Context = unknown> {
  #current: BareApplicationModule<Context> | undefined
  #operation = Promise.resolve()

  constructor(
    readonly runner: ModuleRunner,
    readonly entry: string,
    readonly context: Context,
  ) {}

  start(): Promise<void> {
    return this.#enqueue(async () => {
      this.#current = await this.runner.import<BareApplicationModule<Context>>(this.entry)
      await this.#current.start?.(this.context)
    })
  }

  restart(): Promise<void> {
    return this.#enqueue(async () => {
      await this.#current?.dispose?.()
      this.runner.clearCache()
      this.#current = await this.runner.import<BareApplicationModule<Context>>(this.entry)
      await this.#current.start?.(this.context)
    })
  }

  dispose(): Promise<void> {
    return this.#enqueue(async () => {
      await this.#current?.dispose?.()
      this.#current = undefined
    })
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.#operation.then(operation)

    this.#operation = result.catch(() => undefined)
    return result
  }
}
