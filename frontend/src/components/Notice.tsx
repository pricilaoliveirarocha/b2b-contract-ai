import { useEffect } from 'react'
import { useI18n } from '../lib/i18nContext'

export type NoticeKind = 'success' | 'warning' | 'blocked' | 'error'

export interface NoticeData {
  kind: NoticeKind
  title: string
  items: string[]
}

const STYLE: Record<NoticeKind, { accent: string; title: string; icon: string }> = {
  success: { accent: 'border-l-success', title: 'text-ink', icon: 'text-success' },
  warning: { accent: 'border-l-warning', title: 'text-warning', icon: 'text-warning' },
  blocked: { accent: 'border-l-danger', title: 'text-danger', icon: 'text-danger' },
  error: { accent: 'border-l-danger', title: 'text-danger', icon: 'text-danger' },
}

// Success and warnings fade out on their own; blocks and errors stay until dismissed.
const AUTO_DISMISS_MS: Partial<Record<NoticeKind, number>> = { success: 3000, warning: 8000 }

/** Floating message at the bottom of the screen. */
export default function Notice({ notice, onDismiss }: { notice: NoticeData; onDismiss: () => void }) {
  const { t } = useI18n()
  const style = STYLE[notice.kind]

  useEffect(() => {
    const delay = AUTO_DISMISS_MS[notice.kind]
    if (delay === undefined) return
    const timer = window.setTimeout(onDismiss, delay)
    return () => window.clearTimeout(timer)
  }, [notice, onDismiss])

  return (
    <div
      role={notice.kind === 'blocked' || notice.kind === 'error' ? 'alert' : 'status'}
      className={`fixed inset-x-4 bottom-4 z-50 flex items-start gap-3 rounded-xl border border-l-4 border-border bg-surface p-4 shadow-xl sm:right-6 sm:bottom-6 sm:left-auto sm:w-[26rem] ${style.accent}`}
    >
      <svg
        className={`mt-0.5 size-4 shrink-0 ${style.icon}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {notice.kind === 'success' ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </>
        )}
      </svg>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${style.title}`}>{notice.title}</p>
        {notice.items.length > 0 && (
          <ul className="mt-1.5 space-y-1 text-sm text-ink">
            {notice.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="-m-2 grid size-10 shrink-0 place-items-center rounded-lg text-xl leading-none text-muted hover:bg-background hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={t('notice.dismiss')}
      >
        ×
      </button>
    </div>
  )
}
