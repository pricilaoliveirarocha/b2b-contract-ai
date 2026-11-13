import type { Stage } from '../lib/deals'
import { useI18n } from '../lib/i18nContext'
import { STAGE_THEME } from '../lib/stageTheme'

/** Stage name on a soft tint. Text stays dark for contrast; the color is carried by the dot. */
export default function StageBadge({ stage }: { stage: Stage }) {
  const { t } = useI18n()
  const theme = STAGE_THEME[stage]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink ${theme.badge}`}
    >
      <span className={`size-1.5 rounded-full bg-current ${theme.color}`} aria-hidden="true" />
      {t(`stage.${stage}`)}
    </span>
  )
}
