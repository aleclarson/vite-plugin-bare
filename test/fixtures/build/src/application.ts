import { value } from "#value"

export async function start() {
  const { dynamic } = await import("./dynamic.js")

  return value + dynamic
}
