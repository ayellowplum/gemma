import React from 'react'
import { Box, Text } from 'src/ink.js'
import { GemmaMark } from './GemmaMark.js'

const WELCOME_V2_WIDTH = 72

function Rule(): React.ReactNode {
  return (
    <Text dimColor={true}>
      {'┈'.repeat(WELCOME_V2_WIDTH - 2)}
    </Text>
  )
}

function Highlight({ children }: { children: React.ReactNode }): React.ReactNode {
  return <Text color="professionalBlue">{children}</Text>
}

export function GemmaWelcome() {
  return (
    <Box width={WELCOME_V2_WIDTH} flexDirection="column">
      <Text>
        <Text color="claude">Welcome to Gemma</Text>
        <Text dimColor={true}> v{MACRO.VERSION}</Text>
      </Text>

      <Text dimColor={true}>
        Terminal coding, rebranded with a cleaner Gemma identity.
      </Text>

      <Rule />

      <Box marginTop={1} flexDirection="row" gap={3}>
        <Box flexDirection="column" minWidth={12}>
          <GemmaMark />
          <Text color="claude">     GEM</Text>
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          <Highlight>Elegant tooling. Fast feedback. Quiet confidence.</Highlight>
          <Text dimColor={true}>
            Gemma brings a polished sapphire-and-blue shell to the same
            coding workflow you already know.
          </Text>
          <Text dimColor={true}>
            Use commands, tools, and models without the old branding getting
            in the way.
          </Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="claude">✦</Text> Rich terminal chrome
          <Text dimColor={true}> for a polished first impression</Text>
        </Text>
        <Text>
          <Text color="professionalBlue">✦</Text> Crisp information hierarchy
          <Text dimColor={true}> for model, billing, and workspace context</Text>
        </Text>
        <Text>
          <Text color="claude">✦</Text> A distinct Gemma brand mark
          <Text dimColor={true}> in place of the old mascot-driven style</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Rule />
      </Box>
    </Box>
  )
}
