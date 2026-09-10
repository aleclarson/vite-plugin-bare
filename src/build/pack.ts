import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

import type BareBuffer from "bare-buffer"
import traverse from "bare-module-traverse"
import pack from "bare-pack"
import type BareURL from "bare-url"

type BareResolver = NonNullable<traverse.TraverseOptions["resolve"]>

// bare-module-traverse exposes its runtime resolvers but omits them from its declarations.
const bareResolver = (traverse as typeof traverse & { resolve: { bare: BareResolver } }).resolve
  .bare

const resolveBareModule: BareResolver = function* (entry, parentURL, options) {
  const resolver = bareResolver(entry, parentURL, options)
  let next = resolver.next()

  while (!next.done) {
    const value = next.value

    // Traverse dependencies beside the physical package, including pnpm's private dependencies.
    if ("resolution" in value && value.resolution.protocol === "file:") {
      const filename = fileURLToPath(value.resolution.href)

      if (existsSync(filename)) {
        value.resolution = pathToFileURL(realpathSync(filename)) as unknown as BareURL
      }
    }

    next = resolver.next(yield value)
  }

  return next.value
}

/** Inputs for packaging an existing Vite entry chunk with Bare Pack. */
export interface PackBareOptions {
  /** Absolute filesystem path to the Vite-generated entry chunk. */
  entry: string
  /**
   * Bare target identifiers included in the bundle, such as `ios-arm64`.
   *
   * @defaultValue Bare Pack's current host.
   */
  hosts?: string[]
  /**
   * Whether native addons resolve through the `linked:` protocol.
   *
   * @defaultValue `false`
   */
  linked?: boolean
}

export async function packBareOutput(options: PackBareOptions): Promise<Uint8Array> {
  const entryUrl = pathToFileURL(options.entry)
  const bundle = await pack(
    entryUrl as unknown as BareURL,
    {
      base: new URL(".", entryUrl) as unknown as BareURL,
      resolve: resolveBareModule,
      ...(options.hosts?.length ? { hosts: options.hosts } : {}),
      ...(options.linked === undefined ? {} : { linked: options.linked }),
    },
    (url) => {
      if (url.protocol !== "file:") return null
      const filename = fileURLToPath(url.href)

      return existsSync(filename) && statSync(filename).isFile()
        ? (readFileSync(filename) as unknown as BareBuffer)
        : null
    },
    function* listPrefix(url: BareURL) {
      if (url.protocol !== "file:") return
      const filename = fileURLToPath(url.href)

      if (!existsSync(filename)) return
      for (const entry of readdirSync(filename, {
        recursive: true,
        withFileTypes: true,
      })) {
        if (entry.isFile()) {
          yield pathToFileURL(`${entry.parentPath}/${entry.name}`) as unknown as BareURL
        }
      }
    },
  )

  return bundle.toBuffer()
}
