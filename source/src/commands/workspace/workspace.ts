import { getOriginalCwd, getProjectRoot, getSessionId } from '../../bootstrap/state.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getGitState } from '../../utils/git.js'
import { getCwd } from '../../utils/cwd.js'

export const call: LocalCommandCall = async (_args, context) => {
  const gitState = await getGitState()

  const lines = ['## Workspace Snapshot', '']

  lines.push(`- Current directory: ${getCwd()}`)
  lines.push(`- Original directory: ${getOriginalCwd()}`)
  lines.push(`- Project root: ${getProjectRoot()}`)
  lines.push(`- Session ID: ${getSessionId()}`)
  lines.push(`- Model: ${context.options.mainLoopModel}`)
  lines.push(
    `- Session mode: ${context.options.isNonInteractiveSession ? 'non-interactive' : 'interactive'}`,
  )

  if (gitState) {
    lines.push(`- Git branch: ${gitState.branchName}`)
    lines.push(`- Git commit: ${gitState.commitHash.slice(0, 12)}`)
    lines.push(`- Git status: ${gitState.isClean ? 'clean' : 'dirty'}`)
    lines.push(`- Remote sync: ${gitState.isHeadOnRemote ? 'up to date' : 'ahead/behind or local-only'}`)
    lines.push(`- Worktrees: ${gitState.worktreeCount}`)
  } else {
    lines.push('- Git: unavailable')
  }

  lines.push(`- Commands loaded: ${context.options.commands.length}`)
  lines.push(`- Tools loaded: ${context.options.tools.length}`)
  lines.push(`- MCP servers connected: ${context.options.mcpClients.length}`)

  return {
    type: 'text',
    value: lines.join('\n'),
  }
}
