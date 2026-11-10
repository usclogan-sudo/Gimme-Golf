import { useEffect, useRef, useState } from 'react'
import { supabase, courseToRow, rowToCourse } from '../../lib/supabase'
import { nearbyCatalog, catalogDetail, catalogDetailToCourse, isCompleteCard, type CatalogSearchResult } from '../../lib/courseCatalog'
import type { Course } from '../../types'

// Courses near the player. The licensed catalog answers first, through the
// course-search function: those cards carry tees, ratings and stroke index, so
// a tap starts the round. When the catalog has nothing within range,
// OpenStreetMap supplies names only, and a tap opens Course Setup with the
// name filled in, as before.

interface NearbyCourse {
  id: number
  name: string
  lat: number
  lon: number
  distanceMiles: number
  holes?: string
  website?: string
}

interface Props {
  userId: string
  onAddCourse: (courseName?: string) => void
  onSelectCourse: (course: Course) => void
}

function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function courseHash(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff
  return Math.abs(hash)
}

const COURSE_PHOTO_COUNT = 12

function coursePhoto(name: string): string {
  return `${import.meta.env.BASE_URL}courses/course-${(courseHash(name) % COURSE_PHOTO_COUNT) + 1}.jpg`
}

function fmtDistance(mi: number): string {
  return mi < 1 ? `${(mi * 5280).toFixed(0)} ft` : `${mi.toFixed(1)} mi`
}

const Heading = ({ count }: { count?: number }) => (
  <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base">
    Courses Near You
    {count != null && <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{count}</span>}
  </h2>
)

export function NearMeCourses({ userId, onAddCourse, onSelectCourse }: Props) {
  const [state, setState] = useState<'idle' | 'requesting' | 'loading' | 'done' | 'denied' | 'error'>('idle')
  const [catalog, setCatalog] = useState<CatalogSearchResult[]>([])
  const [osm, setOsm] = useState<NearbyCourse[]>([])
  const [importing, setImporting] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLon, setUserLon] = useState<number | null>(null)
  const hasFetched = useRef(false)

  const requestLocation = () => {
    if (!navigator.geolocation) { setState('error'); return }
    setState('requesting')
    navigator.geolocation.getCurrentPosition(
      pos => { setUserLat(pos.coords.latitude); setUserLon(pos.coords.longitude); setState('loading') },
      () => setState('denied'),
      { timeout: 10000, maximumAge: 300000 },
    )
  }

  useEffect(() => {
    if (state !== 'loading' || userLat === null || userLon === null || hasFetched.current) return
    hasFetched.current = true
    let cancelled = false

    const run = async () => {
      const fromCatalog = await nearbyCatalog(userLat, userLon, 25)
      if (cancelled) return
      if (fromCatalog.length > 0) {
        setCatalog(fromCatalog)
        setOsm([])
        setState('done')
        return
      }
      try {
        const query = `[out:json][timeout:15];(
          way["leisure"="golf_course"](around:40000,${userLat},${userLon});
          relation["leisure"="golf_course"](around:40000,${userLat},${userLon});
        );out center tags;`
        const r = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST', body: query, headers: { 'Content-Type': 'text/plain' },
        })
        const data = await r.json()
        if (cancelled) return
        const results: NearbyCourse[] = data.elements
          .filter((el: any) => el.tags?.name && (el.center || (el.lat && el.lon)))
          .map((el: any) => {
            const lat = el.center?.lat ?? el.lat
            const lon = el.center?.lon ?? el.lon
            return { id: el.id, name: el.tags.name, lat, lon,
              distanceMiles: distanceMiles(userLat, userLon, lat, lon),
              holes: el.tags['golf:holes'] ?? el.tags.holes }
          })
          .sort((a: NearbyCourse, b: NearbyCourse) => a.distanceMiles - b.distanceMiles)
          .slice(0, 8)
        setCatalog([])
        setOsm(results)
        setState('done')
      } catch {
        if (!cancelled) setState('error')
      }
    }
    void run()
    return () => { cancelled = true }
  }, [state, userLat, userLon])

  // One tap on a catalog course: fetch its card, save it as the player's
  // course if it is not already saved, and hand it to the picker.
  const useCatalogCourse = async (r: CatalogSearchResult) => {
    if (importing) return
    setImporting(r.id)
    setImportError(null)
    try {
      const d = await catalogDetail(r.id, r.source)
      const course = d ? catalogDetailToCourse(d) : null
      if (!course) { onAddCourse(r.name); return }
      const hasCard = d!.tees.some(t => t.holes.length >= 9)
      if (!hasCard || !isCompleteCard(course)) { onAddCourse(course.name); return }

      const { data: existing } = await supabase.from('courses').select('*').eq('name', course.name).limit(1)
      if (existing && existing.length > 0) {
        onSelectCourse(rowToCourse(existing[0]))
        return
      }
      const { error } = await supabase.from('courses').insert(courseToRow(course, userId))
      if (error) throw error
      onSelectCourse(course)
    } catch {
      setImportError(`Couldn't load ${r.name}. Try again or search by name.`)
    } finally {
      setImporting(null)
    }
  }

  const retry = () => { hasFetched.current = false; requestLocation() }

  if (state === 'idle') {
    return (
      <section>
        <div className="mb-3"><Heading /></div>
        <button onClick={requestLocation}
          className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm active:bg-gray-50 dark:active:bg-gray-700">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">📍</div>
          <div className="text-left">
            <p className="font-semibold text-gray-800 dark:text-gray-100">Find courses near me</p>
            <p className="text-sm text-gray-500 mt-0.5">Shows golf courses within 25 miles</p>
          </div>
        </button>
      </section>
    )
  }

  if (state === 'requesting' || state === 'loading') {
    return (
      <section>
        <div className="mb-3"><Heading /></div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-6 text-center shadow-sm">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 font-medium">{state === 'requesting' ? 'Getting your location…' : 'Finding nearby courses…'}</p>
        </div>
      </section>
    )
  }

  if (state === 'denied') {
    return (
      <section>
        <div className="mb-3"><Heading /></div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <p className="font-semibold text-amber-800">Location access denied</p>
          <p className="text-amber-700 text-sm mt-1">
            Enable location in your browser settings, or{' '}
            <button onClick={() => onAddCourse()} className="underline font-semibold">add a course manually</button>.
          </p>
        </div>
      </section>
    )
  }

  if (state === 'error') {
    return (
      <section>
        <div className="mb-3"><Heading /></div>
        <div className="bg-gray-100 border border-gray-200 rounded-2xl px-5 py-4">
          <p className="font-semibold text-gray-700">Couldn't load nearby courses</p>
          <p className="text-gray-500 text-sm mt-1">
            <button onClick={retry} className="underline font-semibold text-amber-600">Try again</button>
          </p>
        </div>
      </section>
    )
  }

  if (state === 'done' && catalog.length === 0 && osm.length === 0) {
    return (
      <section>
        <div className="mb-3"><Heading /></div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-5 text-center shadow-sm">
          <p className="text-gray-500">No courses found within 25 miles.</p>
          <button onClick={() => onAddCourse()} className="mt-3 text-amber-600 font-semibold text-sm underline">Add a course manually</button>
        </div>
      </section>
    )
  }

  const count = catalog.length > 0 ? catalog.length : osm.length

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <Heading count={count} />
        <button onClick={retry} className="text-amber-600 text-sm font-semibold">Refresh</button>
      </div>
      {importError && <p className="text-red-600 text-sm mb-2">{importError}</p>}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
        {catalog.map(r => {
          const busy = importing === r.id
          return (
            <button key={`${r.source}:${r.id}`} onClick={() => useCatalogCourse(r)} disabled={!!importing}
              className={`flex-none w-52 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden text-left active:scale-95 transition-transform snap-start ${busy ? 'opacity-70' : ''}`}>
              <div className="h-24 bg-cover bg-center relative" style={{ backgroundImage: `url(${coursePhoto(r.name)})` }}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-black/10" />
                {r.distanceMiles != null && (
                  <div className="absolute bottom-3 left-3 bg-black/30 backdrop-blur-sm rounded-lg px-2 py-1">
                    <p className="text-white text-xs font-semibold">📍 {fmtDistance(r.distanceMiles)}</p>
                  </div>
                )}
              </div>
              <div className="px-3 py-3">
                <p className="font-display font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight line-clamp-2">{r.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {busy ? 'Loading card…' : [r.city, r.state].filter(Boolean).join(', ') || 'Tap to use'}
                </p>
              </div>
            </button>
          )
        })}
        {osm.map(course => (
          <button key={course.id} onClick={() => onAddCourse(course.name)}
            className="flex-none w-52 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden text-left active:scale-95 transition-transform snap-start">
            <div className="h-24 bg-cover bg-center relative" style={{ backgroundImage: `url(${coursePhoto(course.name)})` }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-black/10" />
              <div className="absolute bottom-3 left-3 bg-black/30 backdrop-blur-sm rounded-lg px-2 py-1">
                <p className="text-white text-xs font-semibold">📍 {fmtDistance(course.distanceMiles)}</p>
              </div>
            </div>
            <div className="px-3 py-3">
              <p className="font-display font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight line-clamp-2">{course.name}</p>
              <p className="text-xs text-gray-500 mt-1">{course.holes ? `${course.holes} holes · ` : ''}Tap to add</p>
            </div>
          </button>
        ))}
        <button onClick={() => onAddCourse()}
          className="flex-none w-44 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center py-8 px-4 active:bg-gray-100 snap-start">
          <span className="text-3xl mb-2">+</span>
          <p className="text-gray-500 text-sm font-medium text-center">Add Custom Course</p>
        </button>
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">
        {catalog.length > 0 ? 'Cards from the course catalog' : 'Data from OpenStreetMap'}
      </p>
    </section>
  )
}
