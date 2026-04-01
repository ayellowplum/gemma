import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Box } from '../../ink.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { GemmaMark, type GemmaMarkPose } from './GemmaMark.js'

type Frame = {
  pose: GemmaMarkPose
  offset: number
}

function hold(pose: GemmaMarkPose, offset: number, frames: number): Frame[] {
  return Array.from({ length: frames }, () => ({ pose, offset }))
}

const IDLE_SEQUENCE: readonly Frame[] = [
  ...hold('default', 0, 16),
  ...hold('look-left', 0, 8),
  ...hold('default', 0, 6),
  ...hold('blink', 0, 2),
  ...hold('default', 0, 10),
  ...hold('look-right', 0, 8),
  ...hold('default', 0, 6),
  ...hold('blink', 0, 2),
]

const JUMP_WAVE: readonly Frame[] = [
  ...hold('default', 1, 2),
  ...hold('arms-up', 0, 3),
  ...hold('default', 0, 2),
  ...hold('blink', 0, 1),
  ...hold('default', 1, 2),
  ...hold('arms-up', 0, 3),
  ...hold('default', 0, 2),
]

const LOOK_AROUND: readonly Frame[] = [
  ...hold('look-right', 0, 6),
  ...hold('default', 0, 3),
  ...hold('look-left', 0, 6),
  ...hold('blink', 0, 1),
  ...hold('default', 0, 3),
]

const CLICK_ANIMATIONS: readonly (readonly Frame[])[] = [JUMP_WAVE, LOOK_AROUND]
const FRAME_MS = 120
const GEMMA_HEIGHT = 5

export function AnimatedGemmaMark() {
  const { pose, bounceOffset, onClick } = useGemmaMarkAnimation()

  return (
    <Box height={GEMMA_HEIGHT} flexDirection="column" onClick={onClick}>
      <Box marginTop={bounceOffset} flexShrink={0}>
        <GemmaMark pose={pose} />
      </Box>
    </Box>
  )
}

function useGemmaMarkAnimation(): {
  pose: GemmaMarkPose
  bounceOffset: number
  onClick: () => void
} {
  const [reducedMotion] = useState(
    () => getInitialSettings().prefersReducedMotion ?? false,
  )
  const [frameIndex, setFrameIndex] = useState(0)
  const [isClickAnimation, setIsClickAnimation] = useState(false)
  const sequenceRef = useRef<readonly Frame[]>(IDLE_SEQUENCE)

  const onClick = () => {
    if (reducedMotion || isClickAnimation) return
    sequenceRef.current =
      CLICK_ANIMATIONS[Math.floor(Math.random() * CLICK_ANIMATIONS.length)]!
    setFrameIndex(0)
    setIsClickAnimation(true)
  }

  useEffect(() => {
    if (reducedMotion) return

    const timer = setTimeout(() => {
      const sequence = sequenceRef.current
      const nextIndex = frameIndex + 1

      if (nextIndex >= sequence.length) {
        if (isClickAnimation) {
          sequenceRef.current = IDLE_SEQUENCE
          setFrameIndex(0)
          setIsClickAnimation(false)
          return
        }

        setFrameIndex(0)
        return
      }

      setFrameIndex(nextIndex)
    }, FRAME_MS)

    return () => clearTimeout(timer)
  }, [frameIndex, isClickAnimation, reducedMotion])

  const sequence = sequenceRef.current
  const current = reducedMotion
    ? { pose: 'default' as GemmaMarkPose, offset: 0 }
    : sequence[frameIndex] ?? sequence[0]!

  return {
    pose: current.pose,
    bounceOffset: current.offset,
    onClick,
  }
}
