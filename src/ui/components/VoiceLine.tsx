import { useEffect, useRef } from 'react'
import { levelSource } from '@/app/services'
import type { TextDirection } from '@/core/text/direction'
import { cn } from '@/ui/format'

/**
 * `idle`: a still baseline waiting to be written on.
 * `live`: driven by the input level.
 * `settling`: input has stopped; the remaining wave runs out into the text.
 */
export type VoiceLineMode = 'idle' | 'live' | 'settling'

interface VoiceLineProps {
  mode: VoiceLineMode
  /** Direction of the paragraph it sits in; the wave always travels toward the text. */
  direction: TextDirection
  className?: string
}

const POINTS = 44
const SHIFT_INTERVAL_MS = 55
const EDGE_INSET = 1

/**
 * The line your voice draws. It sits on the text baseline right after the last
 * word: sound enters at the far end and travels toward the text, where it
 * flattens and becomes writing.
 */
export function VoiceLine({ mode, direction, className }: VoiceLineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef(mode)
  const animated = mode !== 'idle'

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const ratio = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.lineWidth = 1.6
    context.lineCap = 'round'
    context.lineJoin = 'round'
    if (animated) {
      // The live line runs from cyan at the text to blue at the far end, with a soft glow.
      const tokens = getComputedStyle(document.documentElement)
      const near = tokens.getPropertyValue('--color-live').trim()
      const far = tokens.getPropertyValue('--color-accent').trim()
      const gradient = context.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, direction === 'rtl' ? far : near)
      gradient.addColorStop(1, direction === 'rtl' ? near : far)
      context.strokeStyle = gradient
      context.shadowColor = near
      context.shadowBlur = 6
      context.lineWidth = 1.9
    } else {
      context.strokeStyle = getComputedStyle(canvas).color
    }

    // Signed levels, newest first. The sign belongs to the sample, so the wave
    // keeps its shape while it travels instead of flickering.
    const samples = new Float32Array(POINTS)
    const middle = height / 2
    const amplitude = middle - 1.5
    const span = width - EDGE_INSET * 2

    const draw = (phase: number) => {
      context.clearRect(0, 0, width, height)
      context.beginPath()
      let lastX = 0
      let lastY = 0
      for (let index = 0; index < POINTS; index++) {
        // 1 at the far end, 0 where the line meets the text.
        const t = Math.max(0, 1 - (index + phase) / (POINTS - 1))
        const x = EDGE_INSET + (direction === 'rtl' ? span * (1 - t) : span * t)
        const y = middle + (samples[index] ?? 0) * Math.sin(Math.PI * t) * amplitude
        if (index === 0) context.moveTo(x, y)
        else context.quadraticCurveTo(lastX, lastY, (lastX + x) / 2, (lastY + y) / 2)
        lastX = x
        lastY = y
      }
      context.lineTo(lastX, lastY)
      context.stroke()
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!animated || reducedMotion) {
      // Without motion, a still wave says "listening" and a flat line says "ready".
      if (animated) samples.forEach((_, index) => (samples[index] = index % 2 === 0 ? 0.45 : -0.45))
      draw(0)
      return
    }

    let frame = 0
    let sign = 1
    let lastShift = performance.now()

    const tick = (now: number) => {
      const steps = Math.floor((now - lastShift) / SHIFT_INTERVAL_MS)
      if (steps > 0) {
        for (let step = 0; step < Math.min(steps, POINTS); step++) {
          samples.copyWithin(1, 0, POINTS - 1)
          sign = -sign
          samples[0] = modeRef.current === 'live' ? sign * levelSource.read() : 0
        }
        lastShift = steps > POINTS ? now : lastShift + steps * SHIFT_INTERVAL_MS
      }
      draw((now - lastShift) / SHIFT_INTERVAL_MS)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [animated, direction])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        'ms-1 -mb-3.5 inline-block h-7 w-24 align-baseline sm:w-32',
        animated ? 'text-live' : 'text-ink-3',
        className,
      )}
    />
  )
}
