import { DevEnvironment, type DevEnvironmentContext, type ResolvedConfig } from "vite"

export class BareDevEnvironment extends DevEnvironment {
  constructor(name: string, config: ResolvedConfig, context: DevEnvironmentContext) {
    super(name, config, {
      ...context,
      hot: true,
      remoteRunner: { inlineSourceMap: true },
    })
  }
}
