import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pack from 'bare-pack'
import type BareURL from 'bare-url'
import type BareBuffer from 'bare-buffer'

export interface PackBareOptions {
  entry: string
  hosts?: string[]
  linked?: boolean
}

export async function packBareOutput(options: PackBareOptions): Promise<Uint8Array> {
  const bundle = await pack(
    pathToFileURL(options.entry) as unknown as BareURL,
    {
      ...(options.hosts?.length ? { hosts: options.hosts } : {}),
      ...(options.linked === undefined ? {} : { linked: options.linked }),
    },
    (url) => {
      if (url.protocol !== 'file:') return null
      const filename = fileURLToPath(url.href)
      return existsSync(filename)
        ? (readFileSync(filename) as unknown as BareBuffer)
        : null
    },
    function* listPrefix(url: BareURL) {
      if (url.protocol !== 'file:') return
      const filename = fileURLToPath(url.href)
      if (!existsSync(filename)) return
      for (const entry of readdirSync(filename, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) {
          yield pathToFileURL(`${entry.parentPath}/${entry.name}`) as unknown as BareURL
        }
      }
    },
  )
  return bundle.toBuffer()
}
