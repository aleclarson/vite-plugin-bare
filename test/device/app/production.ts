BareKit.IPC.write(
  `${JSON.stringify({
    type: "production-start",
    platform: Bare.platform,
    arch: Bare.arch,
  })}\n`,
)

declare const BareKit: { IPC: { write(data: string): void } }
declare const Bare: {
  platform: string
  arch: string
}
