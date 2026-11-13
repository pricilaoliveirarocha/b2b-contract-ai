import { useI18n } from '../lib/i18nContext'
import InfoButton from './InfoButton'

interface StageInfoButtonProps {
  label: string
  description: string
  probability: number
}

/** "i" next to a stage name: what the stage is and its typical win probability. */
export default function StageInfoButton({ label, description, probability }: StageInfoButtonProps) {
  const { t } = useI18n()

  return (
    <InfoButton
      label={t('stageInfo.ask', { stage: label })}
      title={label}
      text={description}
      footer={
        <>
          {t('stageInfo.probability')} <span className="font-semibold text-ink">{probability}%</span>
        </>
      }
    />
  )
}
