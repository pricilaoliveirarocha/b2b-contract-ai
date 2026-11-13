import { apiGet } from './api'

// Mirrors TrendPointOut in backend/app/schemas.py. Money values are decimal strings.
export interface TrendPoint {
  date: string
  open_value: string
  weighted_value: string
  won_value: string
  open_deals: number
}

export const TREND_WEEKS = 8

export async function fetchTrend(): Promise<TrendPoint[]> {
  const { points } = await apiGet<{ points: TrendPoint[] }>(`/stats/trend?weeks=${TREND_WEEKS}`)
  return points
}

/** Change from the first to the last value, in %. Null when there is no baseline. */
export function percentChange(values: number[]): number | null {
  if (values.length < 2) return null
  const first = values[0]!
  const last = values[values.length - 1]!
  if (first === 0) return null
  return ((last - first) / first) * 100
}
