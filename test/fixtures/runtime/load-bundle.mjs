import fs from 'bare-fs'
import Module from 'bare-module'

const [artifact, bundleUrl] = Bare.argv.slice(2)

// BareKit likewise supplies raw bundle bytes under a virtual `.bundle` URL.
await Module.load(new URL(bundleUrl), fs.readFileSync(artifact)).exports
