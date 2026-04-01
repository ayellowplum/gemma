import type { Message } from '../types/message.js'
import { getGlobalConfig } from '../utils/config.js'
import { getCompanion } from './companion.js'

const POSITIVE_REACTIONS = [
  'happy chirp',
  'tiny victory lap',
  'content purring',
  'sparkly nod',
]

const DEBUG_REACTIONS = [
  'squints at the cache graph',
  'guards the prompt prefix',
  'bonks the token leak',
  'taps the debugger with purpose',
]

const PET_REACTIONS = [
  'leans into the headpat',
  'does a proud wiggle',
  'radiates tiny joy',
  'blinks very slowly',
]

const DIRECT_REACTIONS = [
  'is listening',
  'tilts its head',
  'offers moral support',
  'watches the terminal with concern',
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pickReaction(seed: string, reactions: readonly string[]): string {
  return reactions[hashString(seed) % reactions.length]!
}

function extractUserText(message: Message): string {
  if (message.type !== 'user') return ''

  const content = message.message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map(block => {
      if (
        typeof block === 'object' &&
        block !== null &&
        'type' in block &&
        'text' in block &&
        block.type === 'text' &&
        typeof block.text === 'string'
      ) {
        return block.text
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function findAddressedText(
  messages: readonly Message[],
  companionName: string,
): string | undefined {
  const namePattern = new RegExp(`\\b${escapeRegExp(companionName)}\\b`, 'i')

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = extractUserText(messages[index]!)
    if (!text) continue
    if (namePattern.test(text)) return text
  }

  return undefined
}

function selectReaction(text: string, companionName: string): string {
  if (/\b(thanks|thank you|good job|nice|cute|love)\b/i.test(text)) {
    return pickReaction(`${companionName}:${text}`, POSITIVE_REACTIONS)
  }

  if (/\b(cache|token|prompt|resume|bug|fix|broken|drain|wasting)\b/i.test(text)) {
    return pickReaction(`${companionName}:${text}`, DEBUG_REACTIONS)
  }

  if (/\b(pet|pat|boop|scratch|scritch|headpat)\b/i.test(text)) {
    return pickReaction(`${companionName}:${text}`, PET_REACTIONS)
  }

  return pickReaction(`${companionName}:${text}`, DIRECT_REACTIONS)
}

export async function fireCompanionObserver(
  messages: readonly Message[],
  onReaction: (reaction: string | undefined) => void,
): Promise<void> {
  const companion = getCompanion()
  if (!companion || getGlobalConfig().companionMuted) {
    onReaction(undefined)
    return
  }

  const addressedText = findAddressedText(messages, companion.name)
  if (!addressedText) {
    onReaction(undefined)
    return
  }

  onReaction(selectReaction(addressedText, companion.name))
}
