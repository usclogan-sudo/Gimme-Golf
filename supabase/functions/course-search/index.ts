// Supabase Edge Function: course-search
//
// The only place the course vendor is called. The vendor key is the secret
// GOLF_COURSE_API_KEY; the browser never sees it. Every vendor answer is
// written to courses_catalog and course_tees and served from there for thirty
// days, so a search term or a course costs one vendor call a month.
//
// POST, JSON body, one of:
//   { mode: 'search', q }                              name or city
//   { mode: 'near', lat, lng, radiusMiles?, limit? }   catalog, plus vendor on the paid tier
//   { mode: 'detail', id, source? }                    full card for one course
//
// The gateway verifies the caller's JWT before this runs (verify_jwt is on).
// The function uses the service role to write the catalog; players only ever
// read it, through RLS, or through this function.
//
// Vendor: GolfCourseAPI v1.3. Base https://api.golfcourseapi.com,
// Authorization: Bearer <key>. /v1/search?search_query=, /v1/courses/{id},
// /v1/proximity (pro and enterprise only; free tier gets 403). Free tier is
// 35 requests a day, Pro 10,000. GOLF_COURSE_API_TIER=pro turns proximity on;
// GOLF_COURSE_API_DAILY_CAP stops vendor calls for the day once reached.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SOURCE = 'golfcourseapi'
const BASE = 'https://api.golfcourseapi.com'
const CACHE_DAYS = 30
const CACHE_MS = CACHE_DAYS * 24 * 60 * 60 * 1000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ─── Vendor shapes (from the published OpenAPI 1.3.0) ────────────────────────

interface VendorLocation {
  address?: string
  city?: string
  state?: string
  country?: string
  latitude?: number
  longitude?: number
}
interface VendorSummary {
  id: string
  club_name?: string
  course_name?: string
  scorecard_url?: string
  location?: VendorLocation
  tees?: Record<string, number>
  distance?: number
}
interface VendorHole { par?: number; yardage?: number; meters?: number; handicap?: number }
interface VendorTee {
  tee_name?: string
  course_rating?: number
  slope_rating?: number
  total_yards?: number
  total_meters?: number
  number_of_holes?: number
  par_total?: number
  holes?: VendorHole[]
}
interface VendorCourse extends Omit<VendorSummary, 'tees'> {
  tees?: { male?: VendorTee[]; female?: VendorTee[] }
}

// ─── What the app receives ───────────────────────────────────────────────────

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

export interface CatalogTeeHole { hole: number; par: number; yardage: number | null; meters: number | null; strokeIndex: number | null }
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function displayName(club?: string | null, course?: string | null): string {
  const c = (course ?? '').trim()
  const k = (club ?? '').trim()
  if (c && k && k.toLowerCase() !== c.toLowerCase()) return `${k} - ${c}`
  return c || k || 'Unnamed course'
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function isFresh(iso: string | null | undefined): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  return Number.isFinite(t) && Date.now() - t < CACHE_MS
}

function summaryToRow(c: VendorSummary) {
  return {
    source: SOURCE,
    vendor_id: c.id,
    club_name: c.club_name ?? null,
    course_name: c.course_name ?? null,
    name: displayName(c.club_name, c.course_name),
    address: c.location?.address ?? null,
    city: c.location?.city ?? null,
    state: c.location?.state ?? null,
    country: c.location?.country ?? null,
    lat: num(c.location?.latitude),
    lng: num(c.location?.longitude),
    scorecard_url: c.scorecard_url ?? null,
    summary_fetched_at: new Date().toISOString(),
  }
}

function teeCountOf(tees: Record<string, number> | undefined): number | null {
  if (!tees) return null
  return Object.values(tees).reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0)
}

// deno-lint-ignore no-explicit-any
type Db = ReturnType<typeof createClient<any>>

function db(): Db {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}

// ─── Vendor access with a daily cap ──────────────────────────────────────────

type VendorStatus = 'ok' | 'nokey' | 'capped' | 'forbidden' | 'error'

async function underCap(client: Db): Promise<boolean> {
  const cap = Number(Deno.env.get('GOLF_COURSE_API_DAILY_CAP') ?? '9000')
  const day = new Date().toISOString().slice(0, 10)
  const { data } = await client.from('course_vendor_usage').select('calls').eq('day', day).maybeSingle()
  return (data?.calls ?? 0) < cap
}

async function bump(client: Db): Promise<void> {
  const day = new Date().toISOString().slice(0, 10)
  const { data } = await client.from('course_vendor_usage').select('calls').eq('day', day).maybeSingle()
  await client.from('course_vendor_usage').upsert({ day, calls: (data?.calls ?? 0) + 1 })
}

async function vendorGet(client: Db, path: string): Promise<{ status: VendorStatus; httpStatus: number; body: unknown }> {
  const key = Deno.env.get('GOLF_COURSE_API_KEY')
  if (!key) return { status: 'nokey', httpStatus: 0, body: null }
  if (!(await underCap(client))) return { status: 'capped', httpStatus: 0, body: null }
  try {
    const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${key}` } })
    await bump(client)
    let body: unknown = null
    try { body = await res.json() } catch { body = null }
    if (res.status === 403) return { status: 'forbidden', httpStatus: 403, body }
    if (!res.ok) return { status: 'error', httpStatus: res.status, body }
    return { status: 'ok', httpStatus: res.status, body }
  } catch {
    return { status: 'error', httpStatus: 0, body: null }
  }
}

// ─── Search ──────────────────────────────────────────────────────────────────

function cleanQuery(q: unknown): string {
  return String(q ?? '').replace(/[%_,()*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

// deno-lint-ignore no-explicit-any
function rowToResult(r: any, extra: Partial<CatalogSearchResult> = {}): CatalogSearchResult {
  return {
    source: r.source,
    id: r.vendor_id,
    name: r.name,
    clubName: r.club_name ?? null,
    courseName: r.course_name ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    lat: num(r.lat),
    lng: num(r.lng),
    holeCount: num(r.hole_count),
    teeCount: null,
    hasDetail: isFresh(r.detail_fetched_at),
    ...extra,
  }
}

async function search(client: Db, rawQ: unknown) {
  const q = cleanQuery(rawQ)
  if (q.length < 2) return json({ results: [], vendor: 'skipped' })

  const [byName, byCity] = await Promise.all([
    client.from('courses_catalog').select('*').ilike('name', `%${q}%`).limit(25),
    client.from('courses_catalog').select('*').ilike('city', `%${q}%`).limit(25),
  ])
  const local = new Map<string, CatalogSearchResult>()
  for (const r of [...(byName.data ?? []), ...(byCity.data ?? [])]) {
    local.set(`${r.source}:${r.vendor_id}`, rowToResult(r))
  }

  // Ask the vendor once a month per term. Short terms stay local: they match
  // too much to be worth a call.
  let vendor: VendorStatus | 'cached' | 'skipped' = 'skipped'
  const vendorOrder: string[] = []
  if (q.length >= 3) {
    const key = q.toLowerCase()
    const { data: cached } = await client.from('course_search_cache').select('fetched_at, result_ids')
      .eq('kind', 'search').eq('key', key).maybeSingle()
    if (cached && isFresh(cached.fetched_at)) {
      vendor = 'cached'
      vendorOrder.push(...(cached.result_ids ?? []))
    } else {
      const res = await vendorGet(client, `/v1/search?search_query=${encodeURIComponent(q)}`)
      vendor = res.status
      if (res.status === 'ok') {
        const courses = ((res.body as { courses?: VendorSummary[] })?.courses ?? []).filter(c => c?.id)
        if (courses.length > 0) {
          await client.from('courses_catalog').upsert(courses.map(summaryToRow), { onConflict: 'source,vendor_id' })
        }
        for (const c of courses) {
          const id = `${SOURCE}:${c.id}`
          vendorOrder.push(id)
          const existing = local.get(id)
          local.set(id, {
            ...(existing ?? rowToResult(summaryToRow(c))),
            teeCount: teeCountOf(c.tees),
            lat: num(c.location?.latitude) ?? existing?.lat ?? null,
            lng: num(c.location?.longitude) ?? existing?.lng ?? null,
          })
        }
        await client.from('course_search_cache').upsert({
          kind: 'search', key, result_ids: vendorOrder, fetched_at: new Date().toISOString(),
        })
      }
    }
  }

  // Vendor relevance order first, then anything the catalog matched on its own.
  const ordered: CatalogSearchResult[] = []
  const seen = new Set<string>()
  for (const id of vendorOrder) {
    const r = local.get(id)
    if (r && !seen.has(id)) { ordered.push(r); seen.add(id) }
  }
  for (const [id, r] of local) {
    if (!seen.has(id)) { ordered.push(r); seen.add(id) }
  }
  return json({ results: ordered.slice(0, 30), vendor })
}

// ─── Near ────────────────────────────────────────────────────────────────────

async function near(client: Db, body: { lat?: unknown; lng?: unknown; radiusMiles?: unknown; limit?: unknown }) {
  const lat = num(body.lat)
  const lng = num(body.lng)
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: 'lat and lng are required', code: 'bad_request' }, 400)
  }
  const radius = Math.min(Math.max(num(body.radiusMiles) ?? 25, 1), 50)
  const limit = Math.min(Math.max(Math.trunc(num(body.limit) ?? 12), 1), 25)

  // Proximity is a paid vendor feature. On the free tier the catalog answers
  // alone, which still works wherever someone has searched before.
  let vendor: VendorStatus | 'cached' | 'skipped' = 'skipped'
  if ((Deno.env.get('GOLF_COURSE_API_TIER') ?? 'free').toLowerCase() !== 'free') {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)},${Math.round(radius)}`
    const { data: cached } = await client.from('course_search_cache').select('fetched_at')
      .eq('kind', 'near').eq('key', key).maybeSingle()
    if (cached && isFresh(cached.fetched_at)) {
      vendor = 'cached'
    } else {
      const res = await vendorGet(client,
        `/v1/proximity?latitude=${lat}&longitude=${lng}&radius=${radius}&unit=mi&limit=25`)
      vendor = res.status
      if (res.status === 'ok') {
        const courses = ((res.body as { courses?: VendorSummary[] })?.courses ?? []).filter(c => c?.id)
        if (courses.length > 0) {
          await client.from('courses_catalog').upsert(courses.map(summaryToRow), { onConflict: 'source,vendor_id' })
        }
        await client.from('course_search_cache').upsert({
          kind: 'near', key, result_ids: courses.map(c => `${SOURCE}:${c.id}`), fetched_at: new Date().toISOString(),
        })
      }
    }
  }

  const { data, error } = await client.rpc('catalog_courses_near', {
    p_lat: lat, p_lng: lng, p_radius_mi: radius, p_limit: limit,
  })
  if (error) return json({ error: error.message, code: 'catalog_error' }, 500)
  // deno-lint-ignore no-explicit-any
  const results = (data ?? []).map((r: any) => rowToResult(r, { distanceMiles: Math.round(r.distance_mi * 10) / 10 }))
  return json({ results, vendor })
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function teeRows(course: VendorCourse) {
  const out: Array<Record<string, unknown>> = []
  for (const gender of ['male', 'female'] as const) {
    for (const t of course.tees?.[gender] ?? []) {
      const name = (t.tee_name ?? '').trim()
      if (!name) continue
      out.push({
        source: SOURCE,
        vendor_id: course.id,
        gender,
        tee_name: name,
        course_rating: num(t.course_rating),
        slope_rating: num(t.slope_rating),
        par_total: num(t.par_total),
        total_yards: num(t.total_yards),
        total_meters: num(t.total_meters),
        number_of_holes: num(t.number_of_holes) ?? (t.holes?.length ?? null),
        holes: (t.holes ?? []).map((h, i) => ({
          hole: i + 1,
          par: num(h.par),
          yardage: num(h.yardage),
          meters: num(h.meters),
          handicap: num(h.handicap),
        })),
        fetched_at: new Date().toISOString(),
      })
    }
  }
  return out
}

// deno-lint-ignore no-explicit-any
function buildDetail(row: any, tees: any[], stale: boolean): CatalogDetail {
  return {
    source: row.source,
    id: row.vendor_id,
    name: row.name,
    clubName: row.club_name ?? null,
    courseName: row.course_name ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    country: row.country ?? null,
    lat: num(row.lat),
    lng: num(row.lng),
    holeCount: num(row.hole_count),
    scorecardUrl: row.scorecard_url ?? null,
    fetchedAt: row.detail_fetched_at ?? row.summary_fetched_at,
    stale,
    tees: tees.map(t => ({
      gender: t.gender,
      name: t.tee_name,
      rating: num(t.course_rating),
      slope: num(t.slope_rating),
      parTotal: num(t.par_total),
      totalYards: num(t.total_yards),
      holeCount: num(t.number_of_holes),
      // deno-lint-ignore no-explicit-any
      holes: (t.holes ?? []).map((h: any) => ({
        hole: h.hole,
        par: num(h.par) ?? 0,
        yardage: num(h.yardage),
        meters: num(h.meters),
        strokeIndex: num(h.handicap),
      })),
    })),
  }
}

async function detail(client: Db, body: { id?: unknown; source?: unknown }) {
  const id = String(body.id ?? '').trim().toLowerCase()
  const source = String(body.source ?? SOURCE)
  if (!/^[0-9abcdefghjkmnpqrstvwxyz]{8}$/.test(id) || source !== SOURCE) {
    return json({ error: 'Unknown course id', code: 'bad_request' }, 400)
  }

  const { data: row } = await client.from('courses_catalog').select('*')
    .eq('source', source).eq('vendor_id', id).maybeSingle()

  if (row && isFresh(row.detail_fetched_at)) {
    const { data: tees } = await client.from('course_tees').select('*')
      .eq('source', source).eq('vendor_id', id).order('gender').order('tee_name')
    return json({ detail: buildDetail(row, tees ?? [], false), vendor: 'cached' })
  }

  const res = await vendorGet(client, `/v1/courses/${id}`)
  if (res.status === 'ok') {
    const payload = res.body as { course?: VendorCourse } & VendorCourse
    const course: VendorCourse | undefined = payload?.course ?? (payload?.id ? payload : undefined)
    if (course?.id) {
      const rows = teeRows(course)
      const holeCount = rows.map(r => r.number_of_holes as number | null).find(n => n != null) ?? null
      await client.from('courses_catalog').upsert({
        ...summaryToRow(course as VendorSummary),
        hole_count: holeCount,
        detail_fetched_at: new Date().toISOString(),
      }, { onConflict: 'source,vendor_id' })
      await client.from('course_tees').delete().eq('source', SOURCE).eq('vendor_id', course.id)
      if (rows.length > 0) await client.from('course_tees').insert(rows)
      const { data: fresh } = await client.from('courses_catalog').select('*')
        .eq('source', SOURCE).eq('vendor_id', course.id).maybeSingle()
      const { data: tees } = await client.from('course_tees').select('*')
        .eq('source', SOURCE).eq('vendor_id', course.id).order('gender').order('tee_name')
      return json({ detail: buildDetail(fresh, tees ?? [], false), vendor: 'ok' })
    }
  }

  // Vendor unavailable: serve what we have and say it is stale.
  if (row) {
    const { data: tees } = await client.from('course_tees').select('*')
      .eq('source', source).eq('vendor_id', id).order('gender').order('tee_name')
    return json({ detail: buildDetail(row, tees ?? [], true), vendor: res.status })
  }
  const status = res.status === 'nokey' ? 503 : res.httpStatus === 404 ? 404 : 502
  return json({ error: 'Course details are not available right now', code: `vendor_${res.status}` }, status)
}

// ─── Entry ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only', code: 'bad_request' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body must be JSON', code: 'bad_request' }, 400)
  }

  const client = db()
  try {
    switch (body.mode) {
      case 'search': return await search(client, body.q)
      case 'near': return await near(client, body)
      case 'detail': return await detail(client, body)
      default: return json({ error: 'mode must be search, near or detail', code: 'bad_request' }, 400)
    }
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error', code: 'internal' }, 500)
  }
})
