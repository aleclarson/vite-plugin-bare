import { describe, expect, it } from 'vitest'
import {
  isBareRuntimeModule,
  normalizeBareViteConfig,
  packageNameFromId,
} from '../src/core/index.js'

describe('shared core', () => {
  it('normalizes the same resolution and build inputs for dev and production', () => {
    const config = normalizeBareViteConfig(
      {
        entry: './src/application.ts',
        resolve: { conditions: ['development'] },
        runtime: { modules: ['native-bridge'] },
        build: { outDir: 'output', hosts: ['ios-arm64'] },
      },
      '/project',
    )

    expect(config.entry).toBe('/project/src/application.ts')
    expect(config.resolve.conditions).toEqual([
      'bare',
      'worklet',
      'module',
      'development',
    ])
    expect(config.build).toEqual({
      outDir: '/project/output',
      hosts: ['ios-arm64'],
    })
  })

  it.each([
    ['bare', true],
    ['bare-ws', true],
    ['bare-ws/global', true],
    ['@scope/bare-addon', true],
    ['native-bridge/subpath', true],
    ['not-bare', false],
  ])('classifies %s once at the shared boundary', (id, expected) => {
    expect(isBareRuntimeModule(id, ['native-bridge'])).toBe(expected)
  })

  it('extracts scoped and unscoped package names', () => {
    expect(packageNameFromId('@scope/package/subpath')).toBe('@scope/package')
    expect(packageNameFromId('package/subpath?raw')).toBe('package')
  })
})

