import { execFile } from "node:child_process"
import { createWriteStream, existsSync } from "node:fs"
import { copyFile, mkdir, readdir, rename, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import link from "bare-link"

const exec = promisify(execFile)
const deviceRoot = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(deviceRoot, "../..")
const generated = join(deviceRoot, "generated")
const bundles = join(generated, "bundles")
const addons = join(generated, "addons")
const prebuilds = join(generated, "prebuilds")
const cache = join(generated, "cache")
const bareKitVersion = "v2.4.3"
const iosHosts = ["ios-arm64", "ios-arm64-simulator", "ios-x64-simulator"]
const androidHosts = ["android-arm64", "android-arm", "android-ia32", "android-x64"]
const hosts = [...iosHosts, ...androidHosts]
const bundlesOnly = process.argv.includes("--bundles-only")

await mkdir(bundles, { recursive: true })
await run("npm", ["run", "build"], projectRoot)
await packDevelopmentBundle()
await buildProductionBundle()

if (!bundlesOnly) {
  await linkAddons()
  await installBareKitPrebuilds()
  await generateXcodeProject()
}

console.log(`Device harness ready in ${generated}`)

async function packDevelopmentBundle() {
  const barePack = join(projectRoot, "node_modules/bare-pack/bin.js")

  await run(
    process.execPath,
    [
      barePack,
      "--base",
      projectRoot,
      "--linked",
      ...hosts.flatMap((host) => ["--host", host]),
      "--out",
      join(bundles, "dev.bundle"),
      join(deviceRoot, "runtime/dev.mjs"),
    ],
    projectRoot,
  )
}

async function buildProductionBundle() {
  const { buildBareApp } = await import("../../dist/build/index.js")
  const result = await buildBareApp({
    root: deviceRoot,
    configFile: false,
    outDir: "generated/production",
    config: {
      entry: "./app/production.ts",
      build: { hosts },
    },
  })

  await copyFile(result.artifact, join(bundles, "production.bundle"))
}

async function linkAddons() {
  for (const [platform, platformHosts] of [
    ["ios", iosHosts],
    ["android", androidHosts],
  ]) {
    const out = join(addons, platform)

    await rm(out, {
      recursive: true,
      force: true,
    })
    await mkdir(out, { recursive: true })
    for await (const resource of link(projectRoot, {
      hosts: platformHosts,
      out,
    })) {
      console.log(`Linked ${resource.url ?? resource}`)
    }
  }
}

async function installBareKitPrebuilds() {
  const iosFramework = join(prebuilds, "ios/BareKit.xcframework")
  const androidLibrary = join(prebuilds, "android/bare-kit")

  if (existsSync(iosFramework) && existsSync(androidLibrary)) return

  await mkdir(cache, { recursive: true })
  const archive = join(cache, `bare-kit-${bareKitVersion}.zip`)

  if (!existsSync(archive)) {
    await download(
      `https://github.com/holepunchto/bare-kit/releases/download/${bareKitVersion}/prebuilds.zip`,
      archive,
    )
  }

  await mkdir(prebuilds, { recursive: true })
  await run(
    "unzip",
    ["-q", "-o", archive, "ios/BareKit.xcframework/*", "android/bare-kit/*", "-d", prebuilds],
    projectRoot,
  )
}

async function generateXcodeProject() {
  const frameworks = [
    join(prebuilds, "ios/BareKit.xcframework"),
    ...(await listFrameworks(join(addons, "ios"))),
  ]

  await run(
    process.execPath,
    [join(deviceRoot, "ios/generate-project.mjs"), ...frameworks],
    deviceRoot,
  )
  await run("xcodegen", ["generate", "--spec", "ios/project.generated.yml"], deviceRoot)
}

async function listFrameworks(directory) {
  if (!existsSync(directory)) return []
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".xcframework"))
    .map((entry) => join(entry.parentPath, entry.name))
}

async function run(command, args, cwd) {
  console.log(`$ ${command} ${args.join(" ")}`)
  const result = await exec(command, args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

async function download(url, destination) {
  const temporary = `${destination}.download`

  await rm(temporary, { force: true })
  console.log(`Downloading ${url}`)
  try {
    const response = await fetch(url)

    if (!response.ok || response.body === null) {
      throw new Error(`Download failed with HTTP ${response.status}`)
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary))
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}
