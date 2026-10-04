import { describe, expect, it } from 'vitest'
import { createResampler } from './resample'
import { rmsOf, SILENCE_DB, toDecibels } from './signal'
import { concat, noise, silence, sine } from './testSignals'
import { createVad, type VadEvent } from './vad'

const RATE = 16_000

describe('signal level', () => {
  it('measures a full-scale sine at about -3 dB and silence at the floor', () => {
    expect(toDecibels(rmsOf(sine(100, RATE, 440, 1)))).toBeCloseTo(-3.01, 1)
    expect(toDecibels(rmsOf(silence(100, RATE)))).toBe(SILENCE_DB)
    expect(rmsOf(new Float32Array(0))).toBe(0)
  })
})

describe('resampler', () => {
  /** Skips the edges, where the filter is still filling up. */
  const settled = (samples: Float32Array) => samples.subarray(400, samples.length - 400)

  it('produces one third of the samples when going from 48 kHz to 16 kHz', () => {
    const output = createResampler(48_000, RATE).process(sine(1000, 48_000, 440))
    expect(Math.abs(output.length - RATE)).toBeLessThan(20)
  })

  it('keeps a tone in the speech band at its level', () => {
    for (const inputRate of [48_000, 44_100]) {
      const output = createResampler(inputRate, RATE).process(sine(500, inputRate, 1000, 0.5))
      expect(rmsOf(settled(output))).toBeCloseTo(0.5 / Math.SQRT2, 2)
    }
  })

  it('removes a tone the lower rate cannot hold, instead of folding it into the speech band', () => {
    const output = createResampler(48_000, RATE).process(sine(500, 48_000, 11_000, 0.5))
    expect(toDecibels(rmsOf(settled(output)))).toBeLessThan(-50)
  })

  it('gives the same result whether the stream arrives whole or in small blocks', () => {
    const input = sine(300, 44_100, 700)
    const whole = createResampler(44_100, RATE).process(input)

    const resampler = createResampler(44_100, RATE)
    const pieces: Float32Array[] = []
    for (let offset = 0; offset < input.length; offset += 1024) {
      pieces.push(resampler.process(input.subarray(offset, offset + 1024)))
    }
    const chunked = concat(...pieces)

    expect(chunked.length).toBe(whole.length)
    for (let index = 0; index < whole.length; index += 97) {
      expect(chunked[index]).toBeCloseTo(whole[index]!, 5)
    }
  })

  it('passes audio through untouched when the rates already match', () => {
    const input = sine(50, RATE, 300)
    expect(createResampler(RATE, RATE).process(input)).toEqual(input)
  })
})

describe('voice activity detector', () => {
  const run = (...parts: Float32Array[]): VadEvent[] =>
    createVad({ sampleRate: RATE }).process(concat(...parts))

  it('stays quiet in silence and in steady background noise', () => {
    expect(run(silence(3000, RATE))).toEqual([])
    expect(run(noise(5000, RATE, 0.004))).toEqual([])
  })

  it('reports where speech starts and where it ends', () => {
    const events = run(silence(1000, RATE), noise(1500, RATE), silence(1500, RATE))
    expect(events.map((event) => event.type)).toEqual(['speech-start', 'speech-end'])
    expect(events[0]!.atMs).toBeCloseTo(1000, -2)
    expect(events[1]!.atMs).toBeCloseTo(2500, -2)
  })

  it('keeps one stretch of speech across a short pause between words', () => {
    const events = run(
      silence(500, RATE),
      noise(800, RATE),
      silence(300, RATE),
      noise(800, RATE),
      silence(1200, RATE),
    )
    expect(events.map((event) => event.type)).toEqual(['speech-start', 'speech-end'])
  })

  it('ignores a click too short to be a word', () => {
    expect(run(silence(500, RATE), noise(30, RATE, 0.5), silence(1500, RATE))).toEqual([])
  })

  it('hears a voice over a noisy room once it has learned the room', () => {
    const room = noise(4000, RATE, 0.01)
    const voice = noise(1000, RATE, 0.2)
    const events = run(room, voice, noise(1500, RATE, 0.01))
    expect(events.map((event) => event.type)).toEqual(['speech-start', 'speech-end'])
  })

  it('gives the same answer for any block size', () => {
    const stream = concat(silence(700, RATE), noise(900, RATE), silence(1000, RATE))
    const whole = createVad({ sampleRate: RATE }).process(stream)

    const vad = createVad({ sampleRate: RATE })
    const chunked: VadEvent[] = []
    for (let offset = 0; offset < stream.length; offset += 341) {
      chunked.push(...vad.process(stream.subarray(offset, offset + 341)))
    }
    expect(chunked).toEqual(whole)
    expect(vad.speaking).toBe(false)
  })
})
