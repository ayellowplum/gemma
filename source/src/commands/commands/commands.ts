import type { LocalCommandCall } from '../../types/command.js'
import { getCommandName, isCommandEnabled } from '../../types/command.js'

export const call: LocalCommandCall = async (args, context) => {
  const query = args.trim().toLowerCase()

  const visibleCommands = context.options.commands
    .filter(
      command =>
        command.isHidden !== true &&
        isCommandEnabled(command) &&
        command.userInvocable !== false,
    )
    .sort((a, b) => getCommandName(a).localeCompare(getCommandName(b)))

  const filteredCommands = query
    ? visibleCommands.filter(command => {
        const aliases = command.aliases ?? []
        return (
          getCommandName(command).toLowerCase().includes(query) ||
          command.description.toLowerCase().includes(query) ||
          aliases.some(alias => alias.toLowerCase().includes(query))
        )
      })
    : visibleCommands

  if (filteredCommands.length === 0) {
    return {
      type: 'text',
      value: query
        ? `No commands matched "${args.trim()}".`
        : 'No commands are currently available.',
    }
  }

  const lines = [
    '## Available Commands',
    '',
    `Showing ${filteredCommands.length} command${filteredCommands.length === 1 ? '' : 's'}.`,
    '',
  ]

  for (const command of filteredCommands) {
    const aliases = (command.aliases ?? []).filter(Boolean)
    const aliasText = aliases.length > 0 ? ` (aliases: ${aliases.map(alias => `/${alias}`).join(', ')})` : ''
    const mode =
      command.type === 'prompt'
        ? 'prompt'
        : command.type === 'local-jsx'
          ? 'interactive'
          : command.supportsNonInteractive
            ? 'local'
            : 'interactive'

    lines.push(`- /${getCommandName(command)}${aliasText} [${mode}]`)
    lines.push(`  ${command.description}`)
  }

  return {
    type: 'text',
    value: lines.join('\n'),
  }
}
