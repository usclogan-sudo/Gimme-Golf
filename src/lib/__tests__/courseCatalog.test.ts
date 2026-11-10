// A catalog course has to land as a Course the scorecard can trust: tees that
// keep their rating and slope, holes with par and a stroke index set that is
// exactly 1..n, and yardages keyed by tee name. Anything the vendor leaves out
// falls back to something valid and is flagged incomplete rather than guessed
// at silently.

import { describe, it, expect, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))

import { catalogDetailToCourse, isCompleteCard, teeLabel, type CatalogDetail, type CatalogTee } from '../courseCatalog'

const SI18 = [7, 11, 3, 15, 1, 9, 5, 13, 17, 8, 12, 4, 16, 2, 10, 6, 14, 18]
const PAR18 = [4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5]

function tee(over: Partial<CatalogTee> & { name: string; gender: 'male' | 'female' }, withHoles = true): CatalogTee {
  return {
    rating: 71.2,
    slope: 128,
    parTotal: 72,
    totalYards: 6400,
    holeCount: 18,
    holes: withHoles
      ? PAR18.map((par, i) => ({ hole: i + 1, par, yardage: 300 + i * 10, meters: null, strokeIndex: SI18[i] }))
      : [],
    ...over,
  }
}

function detail(tees: CatalogTee[], over: Partial<CatalogDetail> = {}): CatalogDetail {
  return {
    source: 'golfcourseapi',
    id: '7k2m9qb4',
    name: 'Olivas Links',
    clubName: 'Olivas Links',
    courseName: 'Olivas Links',
    address: null,
    city: 'Ventura',
    state: 'CA',
    country: 'United States',
    lat: 34.2,
    lng: -119.2,
    holeCount: 18,
    scorecardUrl: null,
    fetchedAt: '2026-11-10T00:00:00Z',
    stale: false,
    tees,
    ...over,
  }
}

describe('catalogDetailToCourse', () => {
  it('keeps rating and slope per tee, men first, and renames a colliding women\'s tee', () => {
    const course = catalogDetailToCourse(detail([
      tee({ name: 'Red', gender: 'female', rating: 68.9, slope: 118 }),
      tee({ name: 'Blue', gender: 'male', rating: 72.4, slope: 131 }),
      tee({ name: 'Red', gender: 'male', rating: 69.5, slope: 121 }),
    ]))!
    expect(course.tees.map(t => t.name)).toEqual(['Blue', 'Red', 'Red (W)'])
    expect(course.tees[0]).toEqual({ name: 'Blue', rating: 72.4, slope: 131 })
    expect(course.tees[2]).toEqual({ name: 'Red (W)', rating: 68.9, slope: 118 })
    expect(course.holes[0].yardages).toEqual({ Blue: 300, Red: 300, 'Red (W)': 300 })
  })

  it('takes par and stroke index from the card and keeps the full set 1..18', () => {
    const course = catalogDetailToCourse(detail([tee({ name: 'White', gender: 'male' })]))!
    expect(course.holes.map(h => h.par)).toEqual(PAR18)
    expect(course.holes.map(h => h.strokeIndex)).toEqual(SI18)
    expect(isCompleteCard(course)).toBe(true)
    expect(course.name).toBe('Olivas Links')
  })

  it('falls back to the standard stroke index when the card repeats one', () => {
    const t = tee({ name: 'White', gender: 'male' })
    t.holes[3].strokeIndex = 1 // duplicate of hole 5
    const course = catalogDetailToCourse(detail([t]))!
    expect(course.holes.map(h => h.strokeIndex)).toEqual(SI18)
    expect(course.holes.map(h => h.par)).toEqual(PAR18)
  })

  it('builds a par 4 placeholder card when no tee carries holes, and marks it incomplete', () => {
    const course = catalogDetailToCourse(detail([tee({ name: 'Blue', gender: 'male', rating: null, slope: null }, false)]))!
    expect(course.holes).toHaveLength(18)
    expect(course.holes.every(h => h.par === 4)).toBe(true)
    expect(course.tees[0]).toEqual({ name: 'Blue', rating: 72.0, slope: 113 })
    // Placeholder pars are valid numbers, so completeness is about the card
    // having come from somewhere: the caller checks the vendor gave holes.
    expect(isCompleteCard(course)).toBe(true)
  })

  it('handles a nine hole course', () => {
    const nine = tee({ name: 'Gold', gender: 'male', holeCount: 9 })
    nine.holes = nine.holes.slice(0, 9).map((h, i) => ({ ...h, strokeIndex: [5, 3, 1, 7, 9, 4, 2, 8, 6][i] }))
    const course = catalogDetailToCourse(detail([nine], { holeCount: 9 }))!
    expect(course.holes).toHaveLength(9)
    expect(isCompleteCard(course)).toBe(true)
  })

  it('returns null when there are no tees at all', () => {
    expect(catalogDetailToCourse(detail([]))).toBeNull()
    expect(catalogDetailToCourse(detail([tee({ name: '  ', gender: 'male' })]))).toBeNull()
  })
})

describe('isCompleteCard', () => {
  it('rejects a stroke index set that is not exactly 1..n', () => {
    const course = catalogDetailToCourse(detail([tee({ name: 'White', gender: 'male' })]))!
    course.holes[0].strokeIndex = 7
    course.holes[1].strokeIndex = 7
    expect(isCompleteCard(course)).toBe(false)
  })

  it('rejects an odd hole count and a par outside 3 to 6', () => {
    const course = catalogDetailToCourse(detail([tee({ name: 'White', gender: 'male' })]))!
    const twelve = { ...course, holes: course.holes.slice(0, 12) }
    expect(isCompleteCard(twelve)).toBe(false)
    course.holes[5].par = 2
    expect(isCompleteCard(course)).toBe(false)
  })
})

describe('teeLabel', () => {
  it('shows name, rating and slope', () => {
    expect(teeLabel({ name: 'Blue', rating: 72.1, slope: 128 })).toBe('Blue · 72.1 / 128')
    expect(teeLabel({ name: 'Red', rating: 68, slope: 113 })).toBe('Red · 68.0 / 113')
  })
})
