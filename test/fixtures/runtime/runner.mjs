import { startBareViteRuntime } from '../../../dist/runtime/index.js'

const [serverUrl, entry] = Bare.argv.slice(2)

function report(event) {
  console.log(`BARE_TEST:${JSON.stringify(event)}`)
}

globalThis.__bareViteTestReport = report

try {
  await startBareViteRuntime({
    serverUrl,
    entry,
    context: { runtime: 'bare' },
    reportError(error) {
      report({ type: 'error', message: error.message })
    },
    reportStatus(status) {
      report({ type: 'status', status })
    },
  })
} catch (error) {
  report({ type: 'error', message: error.message, stack: error.stack })
  Bare.exit(1)
}
