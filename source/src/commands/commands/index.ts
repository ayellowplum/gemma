import type { Command } from '../../commands.js'

const commands = {
  type: 'local',
  name: 'commands',
  description: 'List available slash commands and aliases',
  supportsNonInteractive: true,
  load: () => import('./commands.js'),
} satisfies Command

export default commands
