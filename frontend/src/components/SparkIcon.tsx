/** Four-point sparkle: the usual mark for "AI" features. */
export default function SparkIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5c.5 4.6 2.4 7 7 7.5-4.6.5-6.5 2.9-7 7.5-.5-4.6-2.4-7-7-7.5 4.6-.5 6.5-2.9 7-7.5Z" />
      <path d="M19 15c.2 1.9 1 2.8 2.8 3-1.8.2-2.6 1.1-2.8 3-.2-1.9-1-2.8-2.8-3 1.8-.2 2.6-1.1 2.8-3Z" />
    </svg>
  )
}
