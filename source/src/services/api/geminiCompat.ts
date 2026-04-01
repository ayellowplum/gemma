import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk/error'
import type {
  BetaContentBlock,
  BetaJSONOutputFormat,
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import type { GoogleAuth } from 'google-auth-library'
import { EMPTY_USAGE } from './emptyUsage.js'
import { safeParseJSON } from '../../utils/json.js'
import { jsonStringify } from '../../utils/slowOperations.js'

type GeminiRole = 'model' | 'user'

type GeminiInlineData = {
  data: string
  mimeType: string
}

type GeminiFunctionCall = {
  args?: unknown
  name: string
}

type GeminiFunctionResponse = {
  name: string
  response: Record<string, unknown>
}

type GeminiPart = {
  functionCall?: GeminiFunctionCall
  functionResponse?: GeminiFunctionResponse
  inlineData?: GeminiInlineData
  text?: string
  thought?: boolean
  thoughtSignature?: string
}

type GeminiContent = {
  parts: GeminiPart[]
  role: GeminiRole
}

type GeminiFunctionDeclaration = {
  description?: string
  name: string
  parameters?: unknown
}

type GeminiTool = {
  functionDeclarations: GeminiFunctionDeclaration[]
}

type GeminiResponse = {
  candidates?: Array<{
    content?: GeminiContent
    finishReason?: string
  }>
  promptFeedback?: {
    blockReason?: string
    blockReasonMessage?: string
  }
  usageMetadata?: {
    cachedContentTokenCount?: number
    candidatesTokenCount?: number
    promptTokenCount?: number
  }
}

type GeminiCountTokensResponse = {
  totalTokens?: number
}

type GeminiRequest = {
  contents: GeminiContent[]
  generationConfig?: Record<string, unknown>
  systemInstruction?: { parts: GeminiPart[] }
  toolConfig?: Record<string, unknown>
  tools?: GeminiTool[]
}

type GeminiCandidate = NonNullable<GeminiResponse['candidates']>[number]

type GeminiRequestLike = Pick<BetaMessageStreamParams, 'messages' | 'model'> &
  Partial<BetaMessageStreamParams>

type VertexConfig = {
  baseUrl?: string
  googleAuth?: GoogleAuth
  projectId?: string
  region?: string
}

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_TIMEOUT_MS = 600 * 1000

const GEMINI_MODELS = [
  {
    id: 'gemini-2.5-pro',
    max_input_tokens: 1_048_576,
    max_tokens: 65_535,
  },
  {
    id: 'gemini-2.5-flash',
    max_input_tokens: 1_048_576,
    max_tokens: 65_535,
  },
]

class GeminiCompatStream {
  controller = new AbortController()

  constructor(
    private readonly events: BetaRawMessageStreamEvent[],
    private readonly signal?: AbortSignal,
  ) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<BetaRawMessageStreamEvent> {
    for (const event of this.events) {
      if (this.controller.signal.aborted || this.signal?.aborted) {
        throw new APIUserAbortError()
      }
      yield event
    }
  }
}

function getGeminiBaseUrl(): string {
  return (process.env.GEMINI_BASE_URL || DEFAULT_GEMINI_BASE_URL).replace(
    /\/+$/,
    '',
  )
}

function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined
}

function createResponseSnapshot(response: Response): Response {
  return new Response(null, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function buildGeminiUrl(model: string, action: string): string {
  return `${getGeminiBaseUrl()}/models/${encodeURIComponent(model)}:${action}`
}

function normalizeVertexBaseUrl(baseUrl: string | undefined, region: string): string {
  const normalized = (
    baseUrl || `https://${region}-aiplatform.googleapis.com`
  ).replace(/\/+$/, '')
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`
}

function getVertexRegion(vertex: VertexConfig | undefined): string {
  return vertex?.region || process.env.CLOUD_ML_REGION || 'us-east5'
}

async function getVertexProjectId(
  vertex: VertexConfig | undefined,
): Promise<string> {
  const envProjectId =
    vertex?.projectId ||
    process.env.ANTHROPIC_VERTEX_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.google_cloud_project ||
    process.env.gcloud_project

  if (envProjectId) {
    return envProjectId
  }

  const authProjectId = await vertex?.googleAuth?.getProjectId?.()
  if (authProjectId) {
    return authProjectId
  }

  throw new APIError(
    400,
    {
      error: {
        type: 'invalid_request_error',
        message: 'Missing Vertex AI project ID',
      },
    },
    'Missing Vertex AI project ID',
    new Headers(),
  )
}

async function buildVertexUrl(
  model: string,
  action: string,
  vertex: VertexConfig,
): Promise<string> {
  const region = getVertexRegion(vertex)
  const projectId = await getVertexProjectId(vertex)
  const baseUrl = normalizeVertexBaseUrl(vertex.baseUrl, region)
  return `${baseUrl}/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}/publishers/google/models/${encodeURIComponent(model)}:${action}`
}

function buildVertexCountTokensRequest(
  request: GeminiRequest,
): Record<string, unknown> {
  return {
    contents: request.contents,
    ...(request.systemInstruction && {
      systemInstruction: request.systemInstruction,
    }),
    ...(request.tools && { tools: request.tools }),
  }
}

async function getVertexAuthHeaders(
  url: string,
  vertex: VertexConfig,
): Promise<Record<string, string>> {
  const skipAuth = process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH
  if (skipAuth === '1' || skipAuth === 'true') {
    return {}
  }

  if (!vertex.googleAuth) {
    throw new APIError(
      401,
      {
        error: {
          type: 'authentication_error',
          message: 'Missing Vertex AI credentials',
        },
      },
      'Missing Vertex AI credentials',
      new Headers(),
    )
  }

  const authClient = await vertex.googleAuth.getClient()
  const authHeaders = await authClient.getRequestHeaders(url)
  return Object.fromEntries(new Headers(authHeaders).entries())
}

function mergeSignals(
  timeoutMs: number,
  ...signals: Array<AbortSignal | null | undefined>
): {
  cleanup: () => void
  didTimeout: () => boolean
  signal: AbortSignal
} {
  const controller = new AbortController()
  let timedOut = false
  const listeners = new Map<AbortSignal, () => void>()
  const abortFromSignal = (source: AbortSignal) => {
    try {
      controller.abort(source.reason)
    } catch {
      controller.abort()
    }
  }

  for (const signal of signals) {
    if (!signal) continue
    if (signal.aborted) {
      abortFromSignal(signal)
      break
    }
    const listener = () => abortFromSignal(signal)
    listeners.set(signal, listener)
    signal.addEventListener('abort', listener, { once: true })
  }

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          controller.abort(new Error('timeout'))
        }, timeoutMs)
      : null

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      for (const [signal, listener] of listeners) {
        signal.removeEventListener('abort', listener)
      }
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function sanitizeGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeGeminiSchema(item))
  }

  const record = asRecord(value)
  if (!record) return value

  const sanitized: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(record)) {
    if (
      key.startsWith('$') ||
      key === 'exclusiveMinimum' ||
      key === 'exclusiveMaximum' ||
      key === 'patternProperties' ||
      key === 'unevaluatedProperties' ||
      key === 'dependentSchemas' ||
      key === 'if' ||
      key === 'then' ||
      key === 'else'
    ) {
      continue
    }

    sanitized[key] = sanitizeGeminiSchema(raw)
  }

  return sanitized
}

function parseMaybeJSON(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return safeParseJSON(trimmed, false) ?? value
  }
  return value
}

function getSystemInstruction(
  system: BetaMessageStreamParams['system'],
): GeminiRequest['systemInstruction'] | undefined {
  if (!system) return undefined
  if (typeof system === 'string') {
    return {
      parts: [{ text: system }],
    }
  }

  const parts: GeminiPart[] = []
  for (const block of system) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push({ text: block.text })
    }
  }

  return parts.length > 0 ? { parts } : undefined
}

function pushGeminiPart(
  contents: GeminiContent[],
  role: GeminiRole,
  part: GeminiPart | null | undefined,
): void {
  if (!part) return
  const last = contents.at(-1)
  if (last?.role === role) {
    last.parts.push(part)
    return
  }
  contents.push({ role, parts: [part] })
}

function blockToGeminiPart(
  block: Record<string, unknown>,
  toolNamesById: Map<string, string>,
): GeminiPart | null {
  switch (block.type) {
    case 'text':
      return typeof block.text === 'string' ? { text: block.text } : null
    case 'image': {
      const source = asRecord(block.source)
      if (
        source?.type === 'base64' &&
        typeof source.data === 'string' &&
        typeof source.media_type === 'string'
      ) {
        return {
          inlineData: {
            data: source.data,
            mimeType: source.media_type,
          },
        }
      }
      return null
    }
    case 'document': {
      const source = asRecord(block.source)
      if (
        source?.type === 'base64' &&
        typeof source.data === 'string' &&
        typeof source.media_type === 'string'
      ) {
        return {
          inlineData: {
            data: source.data,
            mimeType: source.media_type,
          },
        }
      }
      return null
    }
    case 'tool_use': {
      const name = typeof block.name === 'string' ? block.name : undefined
      if (!name) return null
      if (typeof block.id === 'string') {
        toolNamesById.set(block.id, name)
      }
      return {
        functionCall: {
          name,
          args: block.input ?? {},
        },
      }
    }
    case 'tool_result': {
      const toolUseId =
        typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
      const name = toolUseId ? toolNamesById.get(toolUseId) : undefined
      if (!name) {
        return typeof block.content === 'string'
          ? { text: block.content }
          : { text: jsonStringify(block.content ?? '') }
      }

      let responseBody: unknown = block.content ?? ''
      if (Array.isArray(responseBody)) {
        responseBody = responseBody
          .map(item => {
            const record = asRecord(item)
            if (record?.type === 'text' && typeof record.text === 'string') {
              return record.text
            }
            return jsonStringify(item)
          })
          .join('\n')
      }
      responseBody = parseMaybeJSON(responseBody)

      return {
        functionResponse: {
          name,
          response: {
            content: responseBody,
            is_error: block.is_error === true,
          },
        },
      }
    }
    default:
      return null
  }
}

function messagesToGeminiContents(
  messages: BetaMessageStreamParams['messages'],
): GeminiContent[] {
  const contents: GeminiContent[] = []
  const toolNamesById = new Map<string, string>()

  for (const message of messages) {
    const content =
      typeof message.content === 'string'
        ? [{ type: 'text', text: message.content }]
        : message.content

    const role: GeminiRole = message.role === 'assistant' ? 'model' : 'user'
    for (const rawBlock of content) {
      const block = rawBlock as Record<string, unknown>
      const part = blockToGeminiPart(block, toolNamesById)
      pushGeminiPart(contents, role, part)
    }
  }

  return contents
}

function toolsToGeminiTools(tools: BetaToolUnion[] | undefined): GeminiTool[] | undefined {
  if (!tools || tools.length === 0) return undefined
  const declarations = tools
    .map(tool => {
      const record = tool as Record<string, unknown>
      if (typeof record.name !== 'string') return null
      return {
        name: record.name,
        description:
          typeof record.description === 'string' ? record.description : undefined,
        parameters: sanitizeGeminiSchema(record.input_schema),
      } satisfies GeminiFunctionDeclaration
    })
    .filter((tool): tool is GeminiFunctionDeclaration => tool !== null)

  return declarations.length > 0
    ? [{ functionDeclarations: declarations }]
    : undefined
}

function getToolConfig(
  toolChoice: BetaMessageStreamParams['tool_choice'],
): GeminiRequest['toolConfig'] | undefined {
  if (!toolChoice || typeof toolChoice !== 'object') return undefined

  switch (toolChoice.type) {
    case 'none':
      return { functionCallingConfig: { mode: 'NONE' } }
    case 'any':
      return { functionCallingConfig: { mode: 'ANY' } }
    case 'tool':
      return {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames:
            typeof toolChoice.name === 'string' ? [toolChoice.name] : [],
        },
      }
    default:
      return { functionCallingConfig: { mode: 'AUTO' } }
  }
}

function getThinkingConfig(
  model: string,
  thinking: BetaMessageStreamParams['thinking'],
): Record<string, unknown> | undefined {
  if (!thinking || thinking.type === 'disabled') return undefined
  if (thinking.type === 'adaptive') {
    return { thinkingBudget: -1 }
  }

  const requestedBudget =
    typeof thinking.budget_tokens === 'number' ? thinking.budget_tokens : -1

  if (requestedBudget <= 0) {
    return model.includes('flash') ? { thinkingBudget: 0 } : undefined
  }

  return { thinkingBudget: Math.min(32_768, requestedBudget) }
}

function getGenerationConfig(
  model: string,
  params: GeminiRequestLike,
): GeminiRequest['generationConfig'] {
  const config: Record<string, unknown> = {}

  if (typeof params.max_tokens === 'number') {
    config.maxOutputTokens = params.max_tokens
  }

  if (typeof params.temperature === 'number') {
    config.temperature = params.temperature
  }

  const thinkingConfig = getThinkingConfig(model, params.thinking)
  if (thinkingConfig) {
    config.thinkingConfig = thinkingConfig
  }

  const outputConfig = asRecord(
    (params as Record<string, unknown>).output_config,
  )
  const outputFormat = outputConfig?.format as
    | BetaJSONOutputFormat
    | undefined
  if (outputFormat?.type === 'json_schema') {
    config.responseMimeType = 'application/json'
    config.responseJsonSchema = sanitizeGeminiSchema(outputFormat.schema)
  }

  return Object.keys(config).length > 0 ? config : undefined
}

function buildGeminiRequest(params: GeminiRequestLike): GeminiRequest {
  const systemInstruction = getSystemInstruction(params.system)
  const tools = toolsToGeminiTools(params.tools)
  const toolConfig = getToolConfig(params.tool_choice)
  const generationConfig = getGenerationConfig(params.model, params)

  return {
    contents: messagesToGeminiContents(params.messages),
    ...(systemInstruction && { systemInstruction }),
    ...(tools && { tools }),
    ...(toolConfig && { toolConfig }),
    ...(generationConfig && { generationConfig }),
  }
}

function mapGeminiUsage(
  usageMetadata: GeminiResponse['usageMetadata'],
): BetaMessage['usage'] {
  const inputTokens = usageMetadata?.promptTokenCount ?? 0
  const cacheReadTokens = usageMetadata?.cachedContentTokenCount ?? 0
  const cacheCreationTokens = Math.max(inputTokens - cacheReadTokens, 0)

  return {
    ...EMPTY_USAGE,
    input_tokens: inputTokens,
    cache_read_input_tokens: cacheReadTokens,
    cache_creation_input_tokens: cacheCreationTokens,
    output_tokens: usageMetadata?.candidatesTokenCount ?? 0,
    cache_creation: {
      ...EMPTY_USAGE.cache_creation,
      ephemeral_5m_input_tokens: cacheCreationTokens,
    },
  }
}

function candidateToBlocks(candidate: GeminiCandidate): BetaContentBlock[] {
  const blocks: BetaContentBlock[] = []

  for (const part of candidate.content?.parts ?? []) {
    if (part.functionCall?.name) {
      blocks.push({
        type: 'tool_use',
        id: `toolu_${randomUUID().replace(/-/g, '')}`,
        name: part.functionCall.name,
        input: part.functionCall.args ?? {},
        ...(part.thoughtSignature
          ? { thought_signature: part.thoughtSignature }
          : {}),
      } as BetaContentBlock)
      continue
    }

    if (part.thought === true && typeof part.text === 'string') {
      blocks.push({
        type: 'thinking',
        thinking: part.text,
        signature: part.thoughtSignature ?? '',
      } as BetaContentBlock)
      continue
    }

    if (typeof part.text === 'string') {
      blocks.push({
        type: 'text',
        text: part.text,
      } as BetaContentBlock)
    }
  }

  if (blocks.length === 0) {
    blocks.push({
      type: 'text',
      text: '',
    } as BetaContentBlock)
  }

  return blocks
}

function mapStopReason(
  finishReason: string | undefined,
  content: BetaContentBlock[],
): BetaMessage['stop_reason'] {
  if (content.some(block => block.type === 'tool_use')) {
    return 'tool_use'
  }

  switch (finishReason) {
    case 'MAX_TOKENS':
      return 'max_tokens'
    case 'SAFETY':
    case 'RECITATION':
    case 'SPII':
    case 'PROHIBITED_CONTENT':
      return 'refusal'
    default:
      return 'end_turn'
  }
}

function buildBetaMessage(
  model: string,
  response: GeminiResponse,
): BetaMessage {
  const candidate = response.candidates?.[0]
  const content = candidate ? candidateToBlocks(candidate) : []

  return {
    id: `msg_${randomUUID().replace(/-/g, '')}`,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: mapStopReason(candidate?.finishReason, content),
    stop_sequence: null,
    usage: mapGeminiUsage(response.usageMetadata),
  } as BetaMessage
}

function buildStreamEvents(message: BetaMessage): BetaRawMessageStreamEvent[] {
  const events: BetaRawMessageStreamEvent[] = [
    {
      type: 'message_start',
      message: {
        ...message,
        content: [],
        stop_reason: null,
        usage: {
          ...EMPTY_USAGE,
        },
      } as BetaMessage,
    } as BetaRawMessageStreamEvent,
  ]

  message.content.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({
        type: 'content_block_start',
        index,
        content_block: {
          ...block,
          text: '',
        },
      } as BetaRawMessageStreamEvent)
      events.push({
        type: 'content_block_delta',
        index,
        delta: {
          type: 'text_delta',
          text: block.text,
        },
      } as BetaRawMessageStreamEvent)
      events.push({
        type: 'content_block_stop',
        index,
      } as BetaRawMessageStreamEvent)
      return
    }

    if (block.type === 'thinking') {
      events.push({
        type: 'content_block_start',
        index,
        content_block: {
          ...block,
          thinking: '',
          signature: '',
        },
      } as BetaRawMessageStreamEvent)
      if (block.thinking) {
        events.push({
          type: 'content_block_delta',
          index,
          delta: {
            type: 'thinking_delta',
            thinking: block.thinking,
          },
        } as BetaRawMessageStreamEvent)
      }
      if (block.signature) {
        events.push({
          type: 'content_block_delta',
          index,
          delta: {
            type: 'signature_delta',
            signature: block.signature,
          },
        } as BetaRawMessageStreamEvent)
      }
      events.push({
        type: 'content_block_stop',
        index,
      } as BetaRawMessageStreamEvent)
      return
    }

    if (block.type === 'tool_use') {
      const inputJson = jsonStringify(block.input ?? {})
      events.push({
        type: 'content_block_start',
        index,
        content_block: {
          ...block,
          input: '',
        },
      } as BetaRawMessageStreamEvent)
      events.push({
        type: 'content_block_delta',
        index,
        delta: {
          type: 'input_json_delta',
          partial_json: inputJson,
        },
      } as BetaRawMessageStreamEvent)
      events.push({
        type: 'content_block_stop',
        index,
      } as BetaRawMessageStreamEvent)
    }
  })

  events.push({
    type: 'message_delta',
    delta: {
      stop_reason: message.stop_reason,
      stop_sequence: null,
    },
    usage: message.usage,
  } as BetaRawMessageStreamEvent)
  events.push({
    type: 'message_stop',
  } as BetaRawMessageStreamEvent)

  return events
}

async function parseJSONResponse<T>(
  response: Response,
): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new APIError(
      response.status,
      { error: { type: 'invalid_response_error', message: 'Invalid JSON response from Gemini API' } },
      'Invalid JSON response from Gemini API',
      response.headers,
    )
  }
}

async function geminiFetch<T>({
  action,
  body,
  fetchImpl,
  fetchOptions,
  headers,
  model,
  signal,
  timeoutMs,
  vertex,
}: {
  action: string
  body: unknown
  fetchImpl: NonNullable<ClientOptions['fetch']>
  fetchOptions?: ClientOptions['fetchOptions']
  headers: Record<string, string>
  model: string
  signal?: AbortSignal
  timeoutMs: number
  vertex?: VertexConfig
}): Promise<{ data: T; response: Response; requestId: string | null }> {
  const requestHeaders = new Headers(headers)
  requestHeaders.set('content-type', 'application/json')

  const merged = mergeSignals(timeoutMs, signal)

  try {
    const url = vertex
      ? await buildVertexUrl(model, action, vertex)
      : buildGeminiUrl(model, action)

    if (vertex) {
      const vertexHeaders = await getVertexAuthHeaders(url, vertex)
      for (const [key, value] of Object.entries(vertexHeaders)) {
        requestHeaders.set(key, value)
      }
    } else {
      const skipAuth =
        process.env.CLAUDE_CODE_SKIP_GEMINI_AUTH === '1' ||
        process.env.CLAUDE_CODE_SKIP_GEMINI_AUTH === 'true'
      const apiKey = getGeminiApiKey()
      if (!skipAuth) {
        if (!apiKey) {
          throw new APIError(
            401,
            {
              error: {
                type: 'authentication_error',
                message: 'Missing Gemini API key',
              },
            },
            'Missing Gemini API key',
            new Headers(),
          )
        }
        requestHeaders.set('x-goog-api-key', apiKey)
      }
    }

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: requestHeaders,
      body: jsonStringify(body),
      signal: merged.signal,
      ...(fetchOptions as RequestInit | undefined),
    })

    if (!response.ok) {
      const errorPayload = await parseJSONResponse<Record<string, unknown>>(
        response,
      ).catch(() => null)
      const errorRecord = asRecord(errorPayload?.error)
      const message =
        (typeof errorRecord?.message === 'string' && errorRecord.message) ||
        `Gemini API request failed with status ${response.status}`
      throw new APIError(response.status, errorPayload ?? { error: { message } }, message, response.headers)
    }

    const data = await parseJSONResponse<T>(response)
    return {
      data,
      response: createResponseSnapshot(response),
      requestId:
        response.headers.get('x-request-id') ??
        response.headers.get('x-goog-request-id'),
    }
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    if (merged.didTimeout()) {
      throw new APIConnectionTimeoutError({ message: 'Request timed out' })
    }
    if (signal?.aborted) {
      throw new APIUserAbortError()
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIUserAbortError()
    }
    throw error
  } finally {
    merged.cleanup()
  }
}

async function geminiCountTokens(
  request: GeminiRequest,
  model: string,
  fetchImpl: NonNullable<ClientOptions['fetch']>,
  fetchOptions: ClientOptions['fetchOptions'] | undefined,
  headers: Record<string, string>,
  timeoutMs: number,
  signal?: AbortSignal,
  vertex?: VertexConfig,
): Promise<{ input_tokens: number }> {
  if (vertex) {
    const result = await geminiFetch<GeminiCountTokensResponse>({
      action: 'countTokens',
      body: buildVertexCountTokensRequest(request),
      fetchImpl,
      fetchOptions,
      headers,
      model,
      signal,
      timeoutMs,
      vertex,
    })
    return {
      input_tokens: result.data.totalTokens ?? 0,
    }
  }

  try {
    const result = await geminiFetch<GeminiCountTokensResponse>({
      action: 'countTokens',
      body: { generateContentRequest: request },
      fetchImpl,
      fetchOptions,
      headers,
      model,
      signal,
      timeoutMs,
      vertex,
    })
    return {
      input_tokens: result.data.totalTokens ?? 0,
    }
  } catch (error) {
    if (!(error instanceof APIError) || error.status >= 500) {
      throw error
    }
  }

  const result = await geminiFetch<GeminiCountTokensResponse>({
    action: 'countTokens',
    body: request,
    fetchImpl,
    fetchOptions,
    headers,
    model,
    signal,
    timeoutMs,
    vertex,
  })
  return {
    input_tokens: result.data.totalTokens ?? 0,
  }
}

function createGeminiPromise<T>(
  executor: () => Promise<{ data: T; requestId: string | null; response: Response }>,
): Promise<T> & {
  asResponse: () => Promise<Response>
  withResponse: () => Promise<{ data: T; request_id: string | null; response: Response }>
} {
  let resultPromise:
    | Promise<{ data: T; requestId: string | null; response: Response }>
    | undefined

  const getResult = () => {
    resultPromise ??= executor()
    return resultPromise
  }

  const promise = getResult().then(result => result.data) as Promise<T> & {
    asResponse: () => Promise<Response>
    withResponse: () => Promise<{ data: T; request_id: string | null; response: Response }>
  }

  promise.asResponse = async () => (await getResult()).response
  promise.withResponse = async () => {
    const result = await getResult()
    return {
      data: result.data,
      request_id: result.requestId,
      response: result.response,
    }
  }

  return promise
}

export function createGeminiCompatClient({
  defaultHeaders = {},
  fetch,
  fetchOptions,
  timeout = DEFAULT_TIMEOUT_MS,
  vertex,
}: {
  defaultHeaders?: Record<string, string>
  fetch?: ClientOptions['fetch']
  fetchOptions?: ClientOptions['fetchOptions']
  timeout?: number
  vertex?: VertexConfig
}): Anthropic {
  const fetchImpl = (fetch ?? globalThis.fetch) as NonNullable<
    ClientOptions['fetch']
  >

  const client = {
    beta: {
      messages: {
        create(
          params: BetaMessageStreamParams,
          requestOptions?: { headers?: Record<string, string>; signal?: AbortSignal },
        ) {
          return createGeminiPromise<BetaMessage | GeminiCompatStream>(async () => {
            const request = buildGeminiRequest(params)
            const result = await geminiFetch<GeminiResponse>({
              action: 'generateContent',
              body: request,
              fetchImpl,
              fetchOptions,
              headers: {
                ...defaultHeaders,
                ...(requestOptions?.headers ?? {}),
              },
              model: params.model,
              signal: requestOptions?.signal,
              timeoutMs: timeout,
              vertex,
            })

            if (result.data.promptFeedback?.blockReason) {
              const reason = result.data.promptFeedback.blockReason
              const message =
                result.data.promptFeedback.blockReasonMessage ||
                `Gemini blocked the prompt: ${reason}`
              throw new APIError(
                400,
                { error: { type: 'invalid_request_error', message, reason } },
                message,
                result.response.headers,
              )
            }

            const message = buildBetaMessage(params.model, result.data)
            const data = params.stream
              ? (new GeminiCompatStream(
                  buildStreamEvents(message),
                  requestOptions?.signal,
                ) as GeminiCompatStream)
              : message

            return {
              data,
              requestId: result.requestId,
              response: result.response,
            }
          })
        },
        countTokens(params: GeminiRequestLike) {
          return createGeminiPromise<{ input_tokens: number }>(async () => {
            const request = buildGeminiRequest(params)
            const data = await geminiCountTokens(
              request,
              params.model,
              fetchImpl,
              fetchOptions,
              defaultHeaders,
              timeout,
              undefined,
              vertex,
            )
            return {
              data,
              requestId: null,
              response: new Response(null, { status: 200 }),
            }
          })
        },
      },
    },
    models: {
      async *list(): AsyncGenerator<(typeof GEMINI_MODELS)[number]> {
        for (const model of GEMINI_MODELS) {
          yield model
        }
      },
    },
  }

  return client as unknown as Anthropic
}
