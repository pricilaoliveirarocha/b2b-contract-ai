import { useEffect, useRef, useState, type FormEvent } from 'react'
import { checkAdminToken, setAdminToken, useAdminToken, type AdminCheck } from '../lib/admin'
import { useI18n } from '../lib/i18nContext'

const ERROR_KEY = {
  invalid: 'rules.admin.invalid',
  disabled: 'rules.admin.disabled',
  unreachable: 'rules.admin.unreachable',
} as const

/**
 * Lives in the top bar, so it is always clear who is acting. Visitors get a small "Admin" button that
 * asks for the key; the administrator gets a badge and a sign-out button.
 */
export default function AdminAccess() {
  const { t } = useI18n()
  const token = useAdminToken()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [problem, setProblem] = useState<Exclude<AdminCheck, 'ok'> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close the key form on outside click or Esc.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const key = value.trim()
    if (!key) return
    setChecking(true)
    setProblem(null)
    const result = await checkAdminToken(key)
    setChecking(false)
    if (result === 'ok') {
      setAdminToken(key)
      setValue('')
      setOpen(false)
    } else {
      setProblem(result)
    }
  }

  if (token) {
    return (
      <div className="flex items-center gap-0.5">
        <span
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary"
          title={t('rules.admin.badge')}
        >
          <ShieldIcon />
          <span className="hidden sm:inline">{t('rules.admin.badge')}</span>
          <span className="sr-only sm:hidden">{t('rules.admin.badge')}</span>
        </span>
        <button
          type="button"
          onClick={() => setAdminToken(null)}
          aria-label={t('rules.admin.signOut')}
          title={t('rules.admin.signOut')}
          className="grid size-9 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-background hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('rules.admin.signIn')}
        title={t('rules.admin.signIn')}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted transition-colors duration-150 hover:bg-background hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
      >
        <LockIcon />
        <span className="hidden sm:inline">{t('rules.admin.short')}</span>
      </button>

      {open && (
        <form
          onSubmit={submit}
          // Phones: a full-width panel under the top bar. Larger screens: anchored to the button.
          className="fixed inset-x-4 top-24 z-40 rounded-xl border border-border bg-surface p-4 shadow-xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-80"
        >
          <label className="block text-sm font-semibold">
            {t('rules.admin.keyLabel')}
            <input
              type="password"
              autoComplete="off"
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-1.5 block h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm font-normal focus:border-primary focus:outline-2 focus:outline-primary/20"
            />
          </label>
          {problem && (
            <p className="mt-2 text-xs font-medium text-danger" role="alert">
              {t(ERROR_KEY[problem])}
            </p>
          )}
          <button
            type="submit"
            disabled={checking || !value.trim()}
            className="mt-3 h-10 w-full rounded-lg bg-primary text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {checking ? t('rules.admin.checking') : t('rules.admin.enter')}
          </button>
        </form>
      )}
    </div>
  )
}

function ShieldIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 2.9 8.3 7 10 4.1-1.7 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
