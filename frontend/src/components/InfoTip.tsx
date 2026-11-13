import { useEffect, useId, useRef, useState } from 'react'

interface InfoTipProps {
  label: string // accessible name of the button, e.g. "How to read this chart"
  title: string
  text: string
}

/**
 * Small "i" button with an explanation panel. Opens on hover, focus or tap;
 * closes on mouse leave, blur, Esc or tapping outside. The parent must be `relative`.
 */
export default function InfoTip({ label, title, text }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [open])

  return (
    <span ref={wrapperRef} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
        className={`grid size-6 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
          open ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-background hover:text-ink'
        }`}
      >
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v5.5M12 7.5h.01" />
        </svg>
      </button>
      <div
        id={panelId}
        role="note"
        hidden={!open}
        className="absolute top-full right-2 left-2 z-30 mt-1 rounded-xl border border-border bg-surface p-3.5 text-left shadow-lg"
      >
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
      </div>
    </span>
  )
}
