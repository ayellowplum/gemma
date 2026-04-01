import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  getProjectRoot,
  setMainLoopModelOverride,
} from '../../bootstrap/state.js'
import type { LocalCommandCall } from '../../types/command.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { parseUserSpecifiedModel } from '../../utils/model/model.js'
import { getAPIProvider } from '../../utils/model/providers.js'

const CONFIG_DIR = '.gemma'
const CONFIG_FILE = 'vertex.env'

type VertexConfig = {
  enabled: boolean
  useGemini: boolean
  projectId: string
  region: string
  model: string
  skipAuth: boolean
}

function getConfigPath(): string {
  return join(getProjectRoot(), CONFIG_DIR, CONFIG_FILE)
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {}

  const parsed: Record<string, string> = {}
  const contents = readFileSync(filePath, 'utf8')

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    const value = stripWrappingQuotes(line.slice(eq + 1).trim())
    parsed[key] = value
  }

  return parsed
}

function quoteShellValue(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function getCurrentConfig(): VertexConfig {
  return {
    enabled:
      isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) &&
      isEnvTruthy(process.env.CLAUDE_CODE_USE_GEMINI),
    useGemini: isEnvTruthy(process.env.CLAUDE_CODE_USE_GEMINI),
    projectId:
      process.env.ANTHROPIC_VERTEX_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      '',
    region: process.env.CLOUD_ML_REGION || 'us-central1',
    model: process.env.ANTHROPIC_MODEL || 'gemini-2.5-pro',
    skipAuth: isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH),
  }
}

function applyConfig(config: VertexConfig): void {
  process.env.CLAUDE_CODE_USE_VERTEX = config.enabled ? '1' : '0'
  process.env.CLAUDE_CODE_USE_GEMINI = config.useGemini ? '1' : '0'
  process.env.ANTHROPIC_VERTEX_PROJECT_ID = config.projectId
  process.env.CLOUD_ML_REGION = config.region
  process.env.ANTHROPIC_MODEL = config.model
  process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH = config.skipAuth ? '1' : '0'

  setMainLoopModelOverride(parseUserSpecifiedModel(config.model))
}

function persistConfig(config: VertexConfig): string {
  const filePath = getConfigPath()
  mkdirSync(join(getProjectRoot(), CONFIG_DIR), { recursive: true })

  const contents = [
    '# Managed by /vertex inside Gemma.',
    '# Loaded by scripts/run-gemma-vertex.sh on startup.',
    `export CLAUDE_CODE_USE_GEMINI=${quoteShellValue(config.useGemini ? '1' : '0')}`,
    `export CLAUDE_CODE_USE_VERTEX=${quoteShellValue(config.enabled ? '1' : '0')}`,
    `export ANTHROPIC_VERTEX_PROJECT_ID=${quoteShellValue(config.projectId)}`,
    `export CLOUD_ML_REGION=${quoteShellValue(config.region)}`,
    `export ANTHROPIC_MODEL=${quoteShellValue(config.model)}`,
    `export CLAUDE_CODE_SKIP_VERTEX_AUTH=${quoteShellValue(config.skipAuth ? '1' : '0')}`,
    '',
  ].join('\n')

  writeFileSync(filePath, contents, 'utf8')
  return filePath
}

function getPersistedSummary(): string {
  const filePath = getConfigPath()
  if (!existsSync(filePath)) return 'none'

  const parsed = parseEnvFile(filePath)
  const projectId = parsed.ANTHROPIC_VERTEX_PROJECT_ID || 'unset'
  const region = parsed.CLOUD_ML_REGION || 'unset'
  const model = parsed.ANTHROPIC_MODEL || 'unset'
  return `${filePath} (${projectId} / ${region} / ${model})`
}

function formatStatus(config: VertexConfig): string {
  const provider = getAPIProvider()
  return [
    '## Vertex Control',
    '',
    `- Provider: ${provider}`,
    `- Vertex mode: ${config.enabled ? 'enabled' : 'disabled'}`,
    `- Gemini transport: ${config.useGemini ? 'enabled' : 'disabled'}`,
    `- Project: ${config.projectId || 'unset'}`,
    `- Region: ${config.region || 'unset'}`,
    `- Model: ${config.model || 'unset'}`,
    `- Auth mode: ${config.skipAuth ? 'skip' : 'auto'}`,
    `- Persisted config: ${getPersistedSummary()}`,
    '',
    'Examples:',
    '- /vertex on',
    '- /vertex project my-gcp-project',
    '- /vertex region us-central1',
    '- /vertex model gemini-2.5-flash',
    '- /vertex auth auto',
    '- /vertex reset',
  ].join('\n')
}

export const call: LocalCommandCall = async (args, context) => {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const subcommand = (parts[0] || 'status').toLowerCase()
  const value = parts.slice(1).join(' ').trim()
  const config = getCurrentConfig()

  switch (subcommand) {
    case 'status':
      return { type: 'text', value: formatStatus(config) }
    case 'on':
    case 'enable': {
      config.enabled = true
      config.useGemini = true
      applyConfig(config)
      const filePath = persistConfig(config)
      return {
        type: 'text',
        value: `Vertex mode enabled.\nSaved to ${filePath}`,
      }
    }
    case 'off':
    case 'disable': {
      config.enabled = false
      config.useGemini = false
      applyConfig(config)
      const filePath = persistConfig(config)
      return {
        type: 'text',
        value: `Vertex mode disabled for this repo.\nSaved to ${filePath}`,
      }
    }
    case 'project': {
      if (!value) {
        return { type: 'text', value: 'Usage: /vertex project <gcp-project-id>' }
      }
      config.projectId = value
      config.enabled = true
      config.useGemini = true
      applyConfig(config)
      const filePath = persistConfig(config)
      return {
        type: 'text',
        value: `Vertex project set to ${value}.\nSaved to ${filePath}`,
      }
    }
    case 'region': {
      if (!value) {
        return { type: 'text', value: 'Usage: /vertex region <vertex-region>' }
      }
      config.region = value
      applyConfig(config)
      const filePath = persistConfig(config)
      return {
        type: 'text',
        value: `Vertex region set to ${value}.\nSaved to ${filePath}`,
      }
    }
    case 'model': {
      if (!value) {
        return { type: 'text', value: 'Usage: /vertex model <model-name>' }
      }
      const resolvedModel = parseUserSpecifiedModel(value)
      config.model = resolvedModel
      applyConfig(config)
      const filePath = persistConfig(config)
      return {
        type: 'text',
        value: [
          `Vertex model set to ${resolvedModel}.`,
          `Saved to ${filePath}`,
          'The new model override is applied for future turns in this session.',
        ].join('\n'),
      }
    }
    case 'auth': {
      if (!value || !['auto', 'skip'].includes(value)) {
        return { type: 'text', value: 'Usage: /vertex auth <auto|skip>' }
      }
      config.skipAuth = value === 'skip'
      applyConfig(config)
      const filePath = persistConfig(config)
      return {
        type: 'text',
        value: `Vertex auth mode set to ${value}.\nSaved to ${filePath}`,
      }
    }
    case 'reset': {
      const filePath = getConfigPath()
      if (existsSync(filePath)) {
        unlinkSync(filePath)
      }
      process.env.CLAUDE_CODE_USE_GEMINI = '1'
      process.env.CLAUDE_CODE_USE_VERTEX = '1'
      process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH = '0'
      delete process.env.ANTHROPIC_VERTEX_PROJECT_ID
      delete process.env.CLOUD_ML_REGION
      process.env.ANTHROPIC_MODEL = 'gemini-2.5-pro'
      setMainLoopModelOverride(parseUserSpecifiedModel('gemini-2.5-pro'))
      return {
        type: 'text',
        value: `Vertex config reset. Removed ${filePath}. Restart the launcher to use default values again.`,
      }
    }
    default:
      return {
        type: 'text',
        value: `Unknown /vertex subcommand "${subcommand}". Try /vertex status.`,
      }
  }
}
