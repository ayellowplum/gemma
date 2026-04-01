import type { Command } from '../../commands.js'

const workspace = {
  type: 'local',
  name: 'workspace',
  description: 'Show workspace, session, model, and repo status',
  supportsNonInteractive: true,
  load: () => import('./workspace.js'),
} satisfies Command

export default workspace
