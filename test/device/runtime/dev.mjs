import { startBareViteRuntime } from '../../../dist/runtime/index.js'

const [serverUrl, entry = '/app/application.ts'] = Bare.argv

function report(event) {
  BareKit.IPC.write(`${JSON.stringify(event)}\n`)
}

globalThis.__bareViteDeviceReport = report

try {
  await startBareViteRuntime({
    serverUrl,
    entry,
    context: { report },
    reportError(error) {
      report({ type: 'error', message: error.message, stack: error.stack })
    },
    reportStatus(status) {
      report({ type: 'status', status })
    },
  })
} catch (error) {
  report({ type: 'error', message: error.message, stack: error.stack })
}
