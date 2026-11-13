import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useI18n } from '../lib/i18nContext'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode // always visible below the scrolling body
  summary?: ReactNode // a quiet strip between the body and the footer, always visible
  wide?: boolean
}

/** Centered dialog: Esc and the backdrop close it, Tab stays inside, focus returns afterwards. */
export default function Modal({ title, onClose, children, footer, summary, wide = false }: ModalProps) {
  const { t } = useI18n()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  // Keep the latest handler without re-running the focus logic below on every render.
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const panel = panelRef.current
    const previous = document.activeElement as HTMLElement | null
    const fields = panel?.querySelector<HTMLElement>('input,select,textarea')
    ;(fields ?? panel?.querySelector<HTMLElement>(FOCUSABLE))?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-full w-full flex-col rounded-2xl bg-surface shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-base font-bold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('rules.close')}
            className="-m-1 grid size-8 shrink-0 place-items-center rounded-lg text-xl leading-none text-muted hover:bg-background hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
          >
            ×
          </button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {summary && <div className="shrink-0 border-t border-border bg-background/70 px-5 py-2.5">{summary}</div>}
        {footer && <footer className="shrink-0 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}
