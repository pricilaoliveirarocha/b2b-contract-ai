import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../lib/i18nContext'

interface StageInfoButtonProps {
  label: string
  description: string
  probability: number
}

/**
 * Small "i" button that explains a pipeline stage.
 * Opens on hover, keyboard focus or tap; closes on mouse leave, blur, Esc or tapping outside.
 */
export default function StageInfoButton({ label, description, probability }: StageInfoButtonProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function closeOnOutside(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [open])

  return (
    <span
      ref={wrapperRef}
      className="static"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={t('stageInfo.ask', { stage: label })}
        aria-expanded={open}
        aria-controls={panelId}
        // Always opens: with a mouse, hover/focus already opened it, so toggling here would close it.
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
        className={`grid size-6 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
          open ? 'bg-surface text-primary' : 'text-muted hover:bg-surface hover:text-ink'
        }`}
      >
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v5.5M12 7.5h.01" />
        </svg>
      </button>

      <div
        id={panelId}
        role="note"
        hidden={!open}
        className="absolute inset-x-2 top-full z-20 mt-1 rounded-xl border border-border bg-surface p-3.5 text-left shadow-lg"
      >
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>
        <p className="mt-2.5 border-t border-border pt-2 text-xs text-muted">
          {t('stageInfo.probability')} <span className="font-semibold text-ink">{probability}%</span>
        </p>
      </div>
    </span>
  )
}
