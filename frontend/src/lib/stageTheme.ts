import type { Stage } from './deals'

// Soft color per stage, like a heat ramp: early stages blue, security violet, contracts teal.
// Class names are written out in full so Tailwind can find them.
export const STAGE_THEME: Record<
  Stage,
  { column: string; badge: string; marker: 'dot' | 'won' | 'lost'; color: string }
> = {
  discovery: { column: 'from-primary/10 to-primary/[0.02]', badge: 'bg-primary/10', marker: 'dot', color: 'text-primary' },
  business_case: { column: 'from-primary/10 to-primary/[0.02]', badge: 'bg-primary/10', marker: 'dot', color: 'text-primary' },
  poc: { column: 'from-primary/10 to-primary/[0.02]', badge: 'bg-primary/10', marker: 'dot', color: 'text-primary' },
  infosec: { column: 'from-violet/12 to-violet/[0.02]', badge: 'bg-violet/12', marker: 'dot', color: 'text-violet' },
  contracts: { column: 'from-teal/10 to-teal/[0.02]', badge: 'bg-teal/10', marker: 'dot', color: 'text-teal' },
  closed_won: { column: 'from-win/14 to-win/[0.03]', badge: 'bg-win/12', marker: 'won', color: 'text-win' },
  closed_lost: { column: 'from-muted/14 to-muted/[0.04]', badge: 'bg-muted/12', marker: 'lost', color: 'text-muted' },
}
