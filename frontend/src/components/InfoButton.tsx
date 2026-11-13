import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface InfoButtonProps {
  label: string // accessible name of the button, e.g. "What is Discovery?"
  title: string
  text: string
  footer?: ReactNode // extra line under the text
}

const GAP = 14 // distance between the pointer and the popup
const MARGIN = 8 // minimum distance to the window edge

/**
 * Small "i" button whose explanation pops up right next to the mouse pointer and follows it.
 * With the keyboard it appears beside the button instead. Closes on mouse leave, blur, Esc or a
 * tap outside. The popup is rendered in <body>, so no parent can clip it.
 */
export default function InfoButton({ label, title, text, footer }: InfoButtonProps) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const open = anchor !== null

  // Place the popup beside the anchor, flipping to the left / upwards when it would leave the window.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!anchor || !panel) return
    const { width, height } = panel.getBoundingClientRect()
    let left = anchor.x + GAP
    if (left + width > window.innerWidth - MARGIN) left = anchor.x - width - GAP
    let top = anchor.y + GAP
    if (top + height > window.innerHeight - MARGIN) top = anchor.y - height - GAP
    panel.style.left = `${Math.max(MARGIN, left)}px`
    panel.style.top = `${Math.max(MARGIN, top)}px`
    panel.style.visibility = 'visible'
  }, [anchor])

  // A tap outside closes it (there is no "mouse leave" on touch screens).
  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target !== buttonRef.current) setAnchor(null)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [open])

  const followPointer = (event: MouseEvent) => setAnchor({ x: event.clientX, y: event.clientY })

  function showBesideButton() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setAnchor({ x: rect.right, y: rect.bottom })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? panelId : undefined}
        onMouseEnter={followPointer}
        onMouseMove={followPointer}
        onMouseLeave={() => setAnchor(null)}
        onClick={followPointer} // tap on touch screens
        onFocus={showBesideButton}
        onBlur={() => setAnchor(null)}
        onKeyDown={(event) => event.key === 'Escape' && setAnchor(null)}
        className={`grid size-6 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
          open ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface hover:text-ink'
        }`}
      >
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v5.5M12 7.5h.01" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            // Hidden until placed (see the layout effect) so it never flashes in the wrong spot.
            style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}
            className="pointer-events-none z-[60] w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-surface p-3.5 text-left shadow-xl"
          >
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
            {footer && <div className="mt-2.5 border-t border-border pt-2 text-xs text-muted">{footer}</div>}
          </div>,
          document.body,
        )}
    </>
  )
}
