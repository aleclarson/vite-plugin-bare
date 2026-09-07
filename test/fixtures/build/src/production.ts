import { value } from './value.js'

const { dynamic } = await import('./dynamic.js')

console.log(`BARE_PRODUCTION:${JSON.stringify({ value, dynamic })}`)
