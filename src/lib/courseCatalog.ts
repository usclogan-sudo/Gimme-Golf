// The licensed course catalog, reached only through the course-search Edge
// Function. The vendor key never leaves the server; the function caches every
// answer in courses_catalog and course_tees for thirty days.
//
// A catalog course becomes an app Course the moment a player picks it: tees
// with rating and slope, holes with par, stroke index and a yardage per tee.
// The round then snapshots that Course, so a later catalog refresh never
// touches a card already played.

import { v4 as uuidv4 } from 'uuid'
import { supabase } from './supabase'
import type { Course, Hole, Tee } from '../types'

export const CATALOG_SOURCE = 'golfcourseapi'

export interface CatalogSearchResult {
  source: string
  id: string
  name: string
  clubName: string | null
  courseName: string | null
  city: string | null
  state: string | null
  lat: number | null
  lng: number | null
  holeCount: number | null
  teeCount: number | null
  hasDetail: boolean
  distanceMiles?: number
}

export interface CatalogTeeHole {
  hole: number
  par: number
  yardage: number | null
  meters: number | null
  strokeIndex: number | null
}

export interface CatalogTee {
  gender: 'male' | 'female'
  name: string
  rating: number | null
  slope: number | null
  parTotal: number | null
  totalYards: number | null
  holeCount: number | null
  holes: CatalogTeeHole[]
}

export interface CatalogDetail {
  source: string
  id: string
  name: string
  clubName: string | null
  courseName: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  lat: number | null
  lng: number | null
  holeCount: number | null
  scorecardUrl: string | null
  fetchedAt: string
  stale: boolean
  tees: CatalogTee[]
}

// ─── Function calls ──────────────────────────────────────────────────────────

async function call<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke('course-search', { body })
    if (error || !data) return null
    return data as T
  } catch {
    return null
  }
}

export async function searchCatalog(q: string): Promise<CatalogSearchResult[]> {
  const term = q.trim()
  if (term.length < 2) return []
  const res = await call<{ results?: CatalogSearchResult[] }>({ mode: 'search', q: term })
  return res?.results ?? []
}

export async function nearbyCatalog(lat: number, lng: number, radiusMiles = 25): Promise<CatalogSearchResult[]> {
  const res = await call<{ results?: CatalogSearchResult[] }>({ mode: 'near', lat, lng, radiusMiles, limit: 12 })
  return res?.results ?? []
}

export async function catalogDetail(id: string, source = CATALOG_SOURCE): Promise<CatalogDetail | null> {
  const res = await call<{ detail?: CatalogDetail }>({ mode: 'detail', id, source })
  return res?.detail ?? null
}

// ─── Pure conversion ─────────────────────────────────────────────────────────

const STANDARD_SI_18 = [7, 11, 3, 15, 1, 9, 5, 13, 17, 8, 12, 4, 16, 2, 10, 6, 14, 18]
const STANDARD_SI_9 = [5, 3, 1, 7, 9, 4, 2, 8, 6]

function standardSi(count: number): number[] {
  if (count === 9) return STANDARD_SI_9
  if (count === 18) return STANDARD_SI_18
  return Array.from({ length: count }, (_, i) => i + 1)
}

function isPermutation(values: Array<number | null>, count: number): values is number[] {
  if (values.length !== count) return false
  const seen = new Set<number>()
  for (const v of values) {
    if (v == null || !Number.isInteger(v) || v < 1 || v > count || seen.has(v)) return false
    seen.add(v)
  }
  return true
}

/** "Blue · 72.1 / 128": what a player needs to see before picking a tee. */
export function teeLabel(t: Tee): string {
  return `${t.name} · ${t.rating.toFixed(1)} / ${t.slope}`
}

/**
 * A card is complete when every hole has a real par and the stroke indexes
 * are exactly 1..n. Anything less goes to Course Setup for the organizer to
 * finish by hand instead of straight onto a scorecard.
 */
export function isCompleteCard(course: Course): boolean {
  const n = course.holes.length
  if (n !== 9 && n !== 18) return false
  if (course.tees.length === 0) return false
  if (!course.holes.every(h => Number.isInteger(h.par) && h.par >= 3 && h.par <= 6)) return false
  return isPermutation(course.holes.map(h => h.strokeIndex), n)
}

/**
 * Catalog detail to the app's Course. Men's tees first, then women's; a
 * women's tee whose name collides with a men's tee gets " (W)". Par and stroke
 * index come from the first tee that carries a full card. Missing ratings fall
 * back to scratch values so the Course is still valid; isCompleteCard decides
 * whether it is ready to play or needs the setup screen.
 */
export function catalogDetailToCourse(detail: CatalogDetail): Course | null {
  const ordered = [...detail.tees.filter(t => t.gender === 'male'), ...detail.tees.filter(t => t.gender === 'female')]
  const used = new Set<string>()
  const tees: Array<{ tee: Tee; source: CatalogTee }> = []
  for (const t of ordered) {
    const base = t.name.trim()
    if (!base) continue
    let name = base
    if (used.has(name.toLowerCase()) && t.gender === 'female') name = `${base} (W)`
    if (used.has(name.toLowerCase())) continue
    used.add(name.toLowerCase())
    tees.push({
      tee: { name, rating: t.rating ?? 72.0, slope: t.slope ?? 113 },
      source: t,
    })
  }
  if (tees.length === 0) return null

  const reference = tees.find(({ source }) =>
    (source.holes.length === 9 || source.holes.length === 18)
    && source.holes.every(h => Number.isInteger(h.par) && h.par >= 3 && h.par <= 6),
  )
  const holeCount = reference?.source.holes.length ?? (detail.holeCount === 9 ? 9 : 18)
  const fallbackSi = standardSi(holeCount)
  const referenceSi = reference ? reference.source.holes.map(h => h.strokeIndex) : []
  const siFromCard = isPermutation(referenceSi, holeCount) ? referenceSi : null

  const holes: Hole[] = Array.from({ length: holeCount }, (_, i) => {
    const yardages: Record<string, number> = {}
    for (const { tee, source } of tees) {
      const y = source.holes[i]?.yardage
      if (typeof y === 'number' && y > 0) yardages[tee.name] = y
    }
    return {
      number: i + 1,
      par: reference ? reference.source.holes[i].par : 4,
      strokeIndex: siFromCard ? siFromCard[i] : fallbackSi[i],
      yardages,
    }
  })

  return {
    id: uuidv4(),
    name: detail.name,
    tees: tees.map(t => t.tee),
    holes,
    createdAt: new Date(),
  }
}
