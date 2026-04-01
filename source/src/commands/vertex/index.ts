import type { Command } from '../../commands.js'

const vertex = {
  type: 'local',
  name: 'vertex',
  description: 'Show or change Vertex AI connection settings',
  argumentHint: '[status|on|off|project|region|model|auth|reset]',
  supportsNonInteractive: true,
  load: () => import('./vertex.js'),
} satisfies Command

export default vertex
