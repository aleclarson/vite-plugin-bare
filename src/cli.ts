#!/usr/bin/env node
import {
  array,
  command,
  multioption,
  option,
  optional,
  run,
  string,
  subcommands,
} from '@alloc/cmd-ts'
import { buildBareApp } from './build/index.js'

const buildCommand = command({
  name: 'build',
  description: 'Build with Vite, then package the output for Bare',
  args: {
    hosts: multioption({
      long: 'host',
      short: 'h',
      type: array(string),
      defaultValue: () => [],
      description: 'Bare target host (repeatable, e.g. ios-arm64)',
    }),
    outDir: option({
      long: 'out-dir',
      type: optional(string),
      description: 'Output directory relative to the Vite project root',
    }),
  },
  async handler(args) {
    const result = await buildBareApp({
      ...(args.outDir ? { outDir: args.outDir } : {}),
      ...(args.hosts.length ? { hosts: args.hosts } : {}),
    })
    process.stdout.write(`Bare bundle: ${result.artifact}\n`)
  },
})

const cli = subcommands({
  name: 'bare-vite',
  description: 'Build and package Vite applications for Bare',
  cmds: { build: buildCommand },
})

await run(cli, process.argv.slice(2))
