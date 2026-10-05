import { describe, expect, it } from 'vitest'
import { engineOutlook } from './localModels'

describe('engineOutlook', () => {
  it('needs both the graphics card and the libraries the engine uses it through', () => {
    expect(engineOutlook({ cores: 12, nvidia: true, gpuPack: true })).toBe('gpu')
    expect(engineOutlook({ cores: 12, nvidia: true, gpuPack: false })).toBe('gpu-pack-missing')
    expect(engineOutlook({ cores: 12, nvidia: false, gpuPack: true })).toBe('cpu')
  })
})
