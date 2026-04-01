import type { LocalCommandCall } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getCompanion, companionUserId } from '../../buddy/companion.js'
import { RARITY_STARS, type StoredCompanion } from '../../buddy/types.js'

const NAME_PREFIXES = [
  'Byte',
  'Mochi',
  'Pixel',
  'Pico',
  'Patch',
  'Nova',
  'Pebble',
  'Comet',
] as const

const NAME_SUFFIXES = [
  'bug',
  'bean',
  'loop',
  'spark',
  'zip',
  'snip',
  'patch',
  'puff',
] as const

const PERSONALITIES = [
  'calm under pressure and suspicious of wasteful tokens',
  'tiny, loyal, and weirdly good at spotting regressions',
  'cheerful, patient, and obsessed with clean resumes',
  'quietly dramatic about cache misses',
  'kind, curious, and ready to help with debugging',
] as const

const PET_REACTIONS = [
  'melts into the headpat.',
  'does a proud little wiggle.',
  'looks ready to guard your cache prefix.',
  'seems extremely pleased with itself.',
] as const

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick<T>(seed: string, values: readonly T[]): T {
  return values[hashString(seed) % values.length]!
}

function createStoredCompanion(): StoredCompanion {
  const userId = companionUserId()
  const prefix = pick(`${userId}:prefix`, NAME_PREFIXES)
  const suffix = pick(`${userId}:suffix`, NAME_SUFFIXES)
  const personality = pick(`${userId}:personality`, PERSONALITIES)

  return {
    name: `${prefix}${suffix}`,
    personality,
    hatchedAt: Date.now(),
  }
}

function formatStatusLine(): string {
  const companion = getCompanion()
  const muted = getGlobalConfig().companionMuted === true

  if (!companion) {
    return 'No companion hatched yet. Run "/buddy" to hatch one.'
  }

  return [
    `${companion.name} ${RARITY_STARS[companion.rarity]} (${companion.rarity} ${companion.species})`,
    `Personality: ${companion.personality}`,
    `Status: ${muted ? 'muted' : 'active'}`,
  ].join('\n')
}

function setReaction(
  context: Parameters<LocalCommandCall>[1],
  reaction: string | undefined,
): void {
  context.setAppState(prev => ({
    ...prev,
    companionPetAt: Date.now(),
    companionReaction: reaction,
  }))
}

export const call: LocalCommandCall = async (args, context) => {
  const arg = args.trim().toLowerCase()
  const existing = getCompanion()

  if (!existing) {
    if (arg === 'mute' || arg === 'unmute' || arg === 'status') {
      return {
        type: 'text',
        value: 'No companion hatched yet. Run "/buddy" to hatch one first.',
      }
    }

    const stored = createStoredCompanion()
    saveGlobalConfig(current => ({
      ...current,
      companion: stored,
      companionMuted: false,
    }))

    const hatched = getCompanion()
    setReaction(context, 'new buddy acquired')

    return {
      type: 'text',
      value: hatched
        ? [
            `${hatched.name} hatched!`,
            `${hatched.name} is a ${hatched.rarity} ${hatched.species}.`,
            `Personality: ${hatched.personality}`,
            'Run "/buddy status" to see details, or "/buddy mute" to hide them.',
          ].join('\n')
        : 'Your companion hatched.',
    }
  }

  if (!arg || arg === 'pet') {
    const reaction = pick(`${existing.name}:${Date.now()}`, PET_REACTIONS)
    setReaction(context, reaction)
    return {
      type: 'text',
      value: `You pet ${existing.name}. ${existing.name} ${reaction}`,
    }
  }

  if (arg === 'status' || arg === 'info') {
    return {
      type: 'text',
      value: formatStatusLine(),
    }
  }

  if (arg === 'mute' || arg === 'hide' || arg === 'quiet') {
    if (getGlobalConfig().companionMuted) {
      return {
        type: 'text',
        value: `${existing.name} is already muted.`,
      }
    }

    saveGlobalConfig(current => ({
      ...current,
      companionMuted: true,
    }))

    context.setAppState(prev =>
      prev.companionReaction === undefined
        ? prev
        : {
            ...prev,
            companionReaction: undefined,
          },
    )

    return {
      type: 'text',
      value: `${existing.name} is now muted. Run "/buddy unmute" to bring them back.`,
    }
  }

  if (arg === 'unmute' || arg === 'show') {
    if (!getGlobalConfig().companionMuted) {
      return {
        type: 'text',
        value: `${existing.name} is already active.`,
      }
    }

    saveGlobalConfig(current => ({
      ...current,
      companionMuted: false,
    }))
    setReaction(context, 'is back on watch')

    return {
      type: 'text',
      value: `${existing.name} is back on watch.`,
    }
  }

  return {
    type: 'text',
    value: [
      'Usage:',
      '/buddy',
      '/buddy pet',
      '/buddy status',
      '/buddy mute',
      '/buddy unmute',
    ].join('\n'),
  }
}
