import * as React from 'react'
import { useEffect, type ReactNode } from 'react'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { Box, Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import { getEffortSuffix } from '../../utils/effort.js'
import { truncate } from '../../utils/format.js'
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js'
import {
  formatModelAndBilling,
  getLogoDisplayData,
  truncatePath,
} from '../../utils/gemmaBrandUtils.js'
import { renderModelSetting } from '../../utils/model/model.js'
import { OffscreenFreeze } from '../OffscreenFreeze.js'
import { AnimatedGemmaMark } from './AnimatedGemmaMark.js'
import { GemmaMark } from './GemmaMark.js'
import {
  GuestPassesUpsell,
  incrementGuestPassesSeenCount,
  useShowGuestPassesUpsell,
} from './GuestPassesUpsell.js'
import {
  incrementOverageCreditUpsellSeenCount,
  OverageCreditUpsell,
  useShowOverageCreditUpsell,
} from './OverageCreditUpsell.js'

export function CondensedGemmaBrand(): ReactNode {
  const { columns } = useTerminalSize()
  const agent = useAppState(s => s.agent)
  const effortValue = useAppState(s => s.effortValue)
  const model = useMainLoopModel()
  const modelDisplayName = renderModelSetting(model)
  const {
    version,
    cwd,
    billingType,
    agentName: agentNameFromSettings,
  } = getLogoDisplayData()

  const agentName = agent ?? agentNameFromSettings
  const showGuestPassesUpsell = useShowGuestPassesUpsell()
  const showOverageCreditUpsell = useShowOverageCreditUpsell()

  useEffect(() => {
    if (showGuestPassesUpsell) {
      incrementGuestPassesSeenCount()
    }
  }, [showGuestPassesUpsell])

  useEffect(() => {
    if (showOverageCreditUpsell && !showGuestPassesUpsell) {
      incrementOverageCreditUpsellSeenCount()
    }
  }, [showOverageCreditUpsell, showGuestPassesUpsell])

  const textWidth = Math.max(columns - 15, 20)
  const truncatedVersion = truncate(version, Math.max(textWidth - 9, 6))
  const effortSuffix = getEffortSuffix(model, effortValue)
  const { shouldSplit, truncatedModel, truncatedBilling } = formatModelAndBilling(
    modelDisplayName + effortSuffix,
    billingType,
    textWidth,
  )

  const cwdAvailableWidth = agentName
    ? textWidth - 1 - stringWidth(agentName) - 3
    : textWidth
  const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10))
  const pathLine = agentName ? `@${agentName} · ${truncatedCwd}` : truncatedCwd

  return (
    <OffscreenFreeze>
      <Box flexDirection="row" gap={2} alignItems="center">
        {isFullscreenEnvEnabled() ? <AnimatedGemmaMark /> : <GemmaMark />}

        <Box flexDirection="column">
          <Text>
            <Text bold={true} color="claude">
              Gemma
            </Text>{' '}
            <Text color="professionalBlue">v{truncatedVersion}</Text>
          </Text>

          {shouldSplit ? (
            <>
              <Text color="professionalBlue">{truncatedModel}</Text>
              <Text dimColor={true}>{truncatedBilling}</Text>
            </>
          ) : (
            <Text dimColor={true}>
              <Text color="professionalBlue">{truncatedModel}</Text> ·{' '}
              {truncatedBilling}
            </Text>
          )}

          <Text dimColor={true}>{pathLine}</Text>

          {showGuestPassesUpsell && <GuestPassesUpsell />}
          {!showGuestPassesUpsell && showOverageCreditUpsell && (
            <OverageCreditUpsell maxWidth={textWidth} twoLine={true} />
          )}
        </Box>
      </Box>
    </OffscreenFreeze>
  )
}
