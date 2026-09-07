import { writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const iosRoot = dirname(fileURLToPath(import.meta.url))
const deviceRoot = resolve(iosRoot, "..")
const frameworks = process.argv.slice(2).map((path) => relative(iosRoot, path))
const dependencies = frameworks
  .map((path) => `      - framework: ${yaml(path)}\n        embed: true`)
  .join("\n")

const project = `name: BareViteDevice
options:
  bundleIdPrefix: dev.alloc.vitebare
targets:
  BareViteDevice:
    type: application
    platform: iOS
    deploymentTarget: "14.0"
    sources:
      - path: Sources
      - path: ${yaml(relative(iosRoot, resolve(deviceRoot, "generated/bundles")))}
        buildPhase: resources
    dependencies:
${dependencies}
    info:
      path: Info.plist
      properties:
        CFBundleDisplayName: Bare Vite Device
        NSLocalNetworkUsageDescription: Connect to the local Vite development server.
        NSAppTransportSecurity:
          NSAllowsLocalNetworking: true
        UILaunchScreen: {}
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: dev.alloc.vitebare.device
        CODE_SIGN_STYLE: Automatic
`

await writeFile(resolve(iosRoot, "project.generated.yml"), project)

function yaml(value) {
  return JSON.stringify(value)
}
