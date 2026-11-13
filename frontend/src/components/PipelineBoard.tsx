import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useLayoutEffect, useRef, useState } from 'react'
import { formatMoney, STAGES, type Deal, type Stage, type StageInfo } from '../lib/deals'
import { useI18n } from '../lib/i18nContext'
import type { MessageKey } from '../lib/messages'
import { STAGE_THEME } from '../lib/stageTheme'
import DealCard from './DealCard'
import StageInfoButton from './StageInfoButton'

interface PipelineBoardProps {
  deals: Deal[]
  pendingIds: ReadonlySet<number>
  onMove: (deal: Deal, stage: Stage) => void
}

export default function PipelineBoard({ deals, pendingIds, onMove }: PipelineBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const sensors = useSensors(
    // A small distance keeps plain clicks from starting a drag.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // On touch screens, press and hold to drag so swiping still scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )
  const activeDeal = deals.find((deal) => deal.id === activeId)

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    const deal = deals.find((d) => d.id === Number(active.id))
    const stage = over?.id as Stage | undefined
    if (deal && stage && stage !== deal.stage) onMove(deal, stage)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setActiveId(Number(active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {/* `relative` keeps absolutely positioned children (e.g. sr-only text) inside the scroll area. */}
      <div className="scroll-thin relative flex min-h-0 flex-1 snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-4 sm:scroll-px-6 sm:px-6 lg:snap-none">
        {STAGES.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            deals={deals.filter((deal) => deal.stage === stage.id)}
            pendingIds={pendingIds}
          />
        ))}
      </div>

      <DragOverlay>{activeDeal && <DealCard deal={activeDeal} isOverlay />}</DragOverlay>
    </DndContext>
  )
}

interface StageColumnProps {
  stage: StageInfo
  deals: Deal[]
  pendingIds: ReadonlySet<number>
}

function StageMarker({ stage }: { stage: Stage }) {
  const theme = STAGE_THEME[stage]
  if (theme.marker === 'dot') {
    return <span className={`size-2.5 shrink-0 rounded-full bg-current ${theme.color}`} aria-hidden="true" />
  }
  return (
    <svg className={`size-5 shrink-0 ${theme.color}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d={theme.marker === 'won' ? 'm7.5 12.5 3 3 6-6.5' : 'm9 9 6 6m0-6-6 6'}
        fill="none"
        stroke="white"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Heights used to decide whether full cards fit (match DealCard's two layouts).
const CARD_HEIGHT = 108 // tallest regular card (two-line title)
const LIST_GAP = 6

/** Height available for the card list, kept up to date as the window is resized. */
function useAvailableHeight(enabled: boolean) {
  const ref = useRef<HTMLUListElement>(null)
  const [height, setHeight] = useState(Number.POSITIVE_INFINITY)

  useLayoutEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    const measure = () => {
      const style = getComputedStyle(element)
      setHeight(element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))
    }
    measure() // right away, before the first paint
    const observer = new ResizeObserver(measure) // and again whenever the space changes
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [enabled])

  return [ref, height] as const
}

function StageColumn({ stage, deals, pendingIds }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const { t, locale } = useI18n()
  const label = t(`stage.${stage.id}`)
  const total = deals.reduce((sum, deal) => sum + Number(deal.value), 0)
  const [listRef, availableHeight] = useAvailableHeight(deals.length > 0)
  // When full cards would overflow, switch this column to one-line cards instead of scrolling.
  const dense = deals.length * CARD_HEIGHT + (deals.length - 1) * LIST_GAP > availableHeight

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`stage-${stage.id}`}
      // Phones/tablets: fixed width with horizontal swipe. Large screens: columns share the width so all fit.
      className={`flex min-h-0 w-[82vw] max-w-72 shrink-0 snap-start flex-col rounded-2xl border border-white/70 bg-linear-to-b transition-shadow duration-200 sm:w-64 lg:w-auto lg:max-w-80 lg:min-w-56 lg:flex-1 lg:shrink ${
        STAGE_THEME[stage.id].column
      } ${isOver ? 'ring-2 ring-primary/50 ring-inset' : ''}`}
    >
      {/* `relative` anchors the stage info panel to the column width. */}
      <header className="relative shrink-0 px-3 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <StageMarker stage={stage.id} />
          <h2 id={`stage-${stage.id}`} className="truncate text-sm font-bold tracking-tight">
            {label}
          </h2>
          {stage.hasInfo && (
            <StageInfoButton
              label={label}
              description={t(`stageInfo.${stage.id}` as MessageKey)}
              probability={stage.probability}
            />
          )}
          <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-bold shadow-xs">
            {deals.length}
          </span>
        </div>
        {/* Total on its own line so longer (translated) stage names are not cut off. */}
        <p className="mt-0.5 text-xs font-medium text-muted">{formatMoney(total, locale)}</p>
      </header>

      {deals.length === 0 ? (
        <p className="mx-2 mb-2 rounded-xl border border-dashed border-muted/30 py-6 text-center text-xs text-muted">
          {t('column.drop')}
        </p>
      ) : (
        // Cards switch to one-line mode when they wouldn't fit. In the rare case that still overflows,
        // the list can be swiped (no visible bar, soft fade at the bottom).
        <ul
          ref={listRef}
          className="scroll-none fade-bottom flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pt-0.5 pb-2"
        >
          {deals.map((deal) => (
            <li key={deal.id}>
              <DraggableDeal deal={deal} isPending={pendingIds.has(deal.id)} dense={dense} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DraggableDeal({ deal, isPending, dense }: { deal: Deal; isPending: boolean; dense: boolean }) {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    disabled: isPending, // one move at a time per deal
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={t('card.dragHint', { title: deal.title, company: deal.company.name })}
      className={`touch-manipulation rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        isPending ? 'cursor-wait opacity-60' : 'cursor-grab'
      } ${isDragging ? 'opacity-30' : ''}`}
    >
      <DealCard deal={deal} dense={dense} />
    </div>
  )
}
