import type { NormalizedBareViteConfig } from "./config.js"

const BARE_PACKAGE = /^(?:bare(?:$|[-/])|@[^/]+\/bare(?:$|[-/]))/

export function packageNameFromId(id: string): string {
  const clean = id.replace(/^\0/, "").split("?")[0] ?? id

  if (clean.startsWith("@")) return clean.split("/").slice(0, 2).join("/")
  return clean.split("/")[0] ?? clean
}

export function isBareRuntimeModule(
  id: string,
  configuredModules: readonly string[] = [],
): boolean {
  const packageName = packageNameFromId(id)

  return (
    BARE_PACKAGE.test(packageName) ||
    configuredModules.some((module) => id === module || id.startsWith(`${module}/`))
  )
}

export function createBareExternalPredicate(
  config: Pick<NormalizedBareViteConfig, "runtime">,
): (id: string) => boolean {
  return (id) => isBareRuntimeModule(id, config.runtime.modules)
}
