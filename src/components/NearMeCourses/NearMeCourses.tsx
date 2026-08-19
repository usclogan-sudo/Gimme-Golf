import { useEffect, useRef, useState } from 'react'

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
  onAddCourse: (courseName?: string) => void
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

export function NearMeCourses({ onAddCourse }: Props) {
  const [state, setState] = useState<'idle' | 'requesting' | 'loading' | 'done' | 'denied' | 'error'>('idle')
  const [courses, setCourses] = useState<NearbyCourse[]>([])
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
    const query = `[out:json][timeout:15];(
      way["leisure"="golf_course"](around:40000,${userLat},${userLon});
      relation["leisure"="golf_course"](around:40000,${userLat},${userLon});
    );out center tags;`
    fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: query, headers: { 'Content-Type': 'text/plain' },
    })
      .then(r => r.json())
      .then(data => {
        const results: NearbyCourse[] = data.elements
          .filter((el: any) => el.tags?.name && (el.center || (el.lat && el.lon)))
          .map((el: any) => {
            const lat = el.center?.lat ?? el.lat
            const lon = el.center?.lon ?? el.lon
            return { id: el.id, name: el.tags.name, lat, lon,
              distanceMiles: distanceMiles(userLat!, userLon!, lat, lon),
              holes: el.tags['golf:holes'] ?? el.tags.holes }
          })
          .sort((a: NearbyCourse, b: NearbyCourse) => a.distanceMiles - b.distanceMiles)
          .slice(0, 8)
        setCourses(results)
        setState('done')
      })
      .catch(() => setState('error'))
  }, [state, userLat, userLon])

  if (state === 'idle') {
    return (
      <section>
        <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Courses Near You</h2>
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
        <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Courses Near You</h2>
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
        <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Courses Near You</h2>
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
        <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Courses Near You</h2>
        <div className="bg-gray-100 border border-gray-200 rounded-2xl px-5 py-4">
          <p className="font-semibold text-gray-700">Couldn't load nearby courses</p>
          <p className="text-gray-500 text-sm mt-1">
            <button onClick={() => { hasFetched.current = false; requestLocation() }}
              className="underline font-semibold text-amber-600">Try again</button>
          </p>
        </div>
      </section>
    )
  }

  if (state === 'done' && courses.length === 0) {
    return (
      <section>
        <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Courses Near You</h2>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-5 text-center shadow-sm">
          <p className="text-gray-500">No courses found within 25 miles.</p>
          <button onClick={() => onAddCourse()} className="mt-3 text-amber-600 font-semibold text-sm underline">Add a course manually</button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base">
          Courses Near You
          <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{courses.length}</span>
        </h2>
        <button onClick={() => { hasFetched.current = false; requestLocation() }} className="text-amber-600 text-sm font-semibold">Refresh</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
        {courses.map(course => (
          <button key={course.id} onClick={() => onAddCourse(course.name)}
            className="flex-none w-52 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden text-left active:scale-95 transition-transform snap-start">
            <div className="h-24 bg-cover bg-center relative" style={{ backgroundImage: `url(${coursePhoto(course.name)})` }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-black/10" />
              <div className="absolute bottom-3 left-3 bg-black/30 backdrop-blur-sm rounded-lg px-2 py-1">
                <p className="text-white text-xs font-semibold">
                  📍 {course.distanceMiles < 1 ? `${(course.distanceMiles * 5280).toFixed(0)} ft` : `${course.distanceMiles.toFixed(1)} mi`}
                </p>
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
      <p className="text-center text-xs text-gray-400 mt-2">Data from OpenStreetMap</p>
    </section>
  )
}
