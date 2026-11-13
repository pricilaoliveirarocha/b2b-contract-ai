interface SwitchProps {
  checked: boolean
  label: string // accessible name
  onText: string
  offText: string
  disabled?: boolean
  compact?: boolean // only the toggle; the state is still read aloud
  onChange: (checked: boolean) => void
}

/** On/off toggle. By default the state is written next to it (color alone is not enough). */
export default function Switch({ checked, label, onText, offText, disabled, compact = false, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={compact ? (checked ? onText : offText) : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex shrink-0 items-center gap-2 rounded-full p-1.5 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60"
    >
      {!compact && <span className="text-xs font-medium text-muted">{checked ? onText : offText}</span>}
      <span
        className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-border'}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </span>
    </button>
  )
}
