import React from 'react'
import { Box, Text } from '../../ink.js'

export type GemmaMarkPose =
  | 'default'
  | 'arms-up'
  | 'look-left'
  | 'look-right'
  | 'blink'

type Props = {
  pose?: GemmaMarkPose
}

type SparkPair = {
  left: string
  right: string
}

function getSparks(pose: GemmaMarkPose): SparkPair {
  switch (pose) {
    case 'arms-up':
      return { left: '*', right: '*' }
    case 'look-left':
      return { left: '*', right: ' ' }
    case 'look-right':
      return { left: ' ', right: '*' }
    default:
      return { left: '.', right: '.' }
  }
}

function GemmaRow({
  left,
  center,
  right,
}: {
  left: string
  center: string
  right: string
}): React.ReactNode {
  return (
    <Text>
      <Text color="professionalBlue">{left}</Text>
      <Text color="clawd_body">{center}</Text>
      <Text color="professionalBlue">{right}</Text>
    </Text>
  )
}

export function GemmaMark({ pose = 'default' }: Props = {}): React.ReactNode {
  const sparks = getSparks(pose)
  const eye =
    pose === 'look-left'
      ? '◉   '
      : pose === 'look-right'
        ? '   ◉'
        : pose === 'blink'
          ? '────'
          : ' ◉  '

  return (
    <Box flexDirection="column">
      <GemmaRow left={` ${sparks.left} `} center="  █████  " right={` ${sparks.right} `} />
      <GemmaRow left="   " center=" ███████ " right="   " />
      <GemmaRow left="   " center={`██${eye}██`} right="   " />
      <GemmaRow left="   " center=" ███████ " right="   " />
      <GemmaRow left="   " center="  █████  " right="   " />
    </Box>
  )
}
