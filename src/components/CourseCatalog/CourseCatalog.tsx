import { useState, useRef, useCallback, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase, courseToRow } from '../../lib/supabase'
import { venturaCourses } from '../../data/venturaCourses'
import { searchCatalog, catalogDetail, catalogDetailToCourse, isCompleteCard } from '../../lib/courseCatalog'
import type { CatalogSearchResult } from '../../lib/courseCatalog'
import type { Course } from '../../types'
import { Seal } from '../brand'

interface Props {
  userId: string
  onDone: () => void
  onAddCustom: () => void
  onPrefillCourse?: (course: Course) => void
}

function totalPar(holes: { par: number }[]) {
  return holes.reduce((s, h) => s + h.par, 0)
}

export function CourseCatalog({ userId, onDone, onAddCustom, onPrefillCourse }: Props) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // API search state
  const [apiResults, setApiResults] = useState<CatalogSearchResult[]>([])
  const [apiSearching, setApiSearching] = useState(false)
  const [apiImporting, setApiImporting] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  // Auto-focus search on mount
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Debounced API search (reduced to 300ms)
  const doApiSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim() || q.trim().length < 2) {
      setApiResults([])
      setApiSearching(false)
      return
    }
    setApiSearching(true)
    debounceRef.current = setTimeout(async () => {
      const results = await searchCatalog(q.trim())
      setApiResults(results)
      setApiSearching(false)
    }, 300)
  }, [])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const handleQueryChange = (q: string) => {
    setQuery(q)
    doApiSearch(q)
  }

  // Filter local ventura courses
  const filtered = query.trim()
    ? venturaCourses.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.city.toLowerCase().includes(query.toLowerCase())
      )
    : venturaCourses

  // Group by city
  const cities = Array.from(new Set(filtered.map(c => c.city)))

  const handleAdd = async (templateName: string) => {
    if (adding) return
    const template = venturaCourses.find(c => c.name === templateName)
    if (!template) return

    // Check for duplicate
    const { count } = await supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('name', template.name)
    if (count && count > 0) {
      setAdded(prev => new Set(prev).add(templateName))
      return
    }

    setAdding(templateName)
    setError(null)
    try {
      const course: Course = {
        id: uuidv4(),
        name: template.name,
        tees: template.tees,
        holes: template.holes,
        createdAt: new Date(),
      }
      const { error: err } = await supabase.from('courses').insert(courseToRow(course, userId))
      if (err) throw err
      setAdded(prev => new Set(prev).add(templateName))
      setTimeout(onDone, 600)
    } catch {
      setError(`Failed to add ${template.name}. Please try again.`)
    } finally {
      setAdding(null)
    }
  }

  const handleApiImport = async (result: CatalogSearchResult) => {
    if (apiImporting) return
    setApiImporting(result.id)
    setError(null)

    try {
      const detail = await catalogDetail(result.id, result.source)
      if (!detail) {
        setError('Could not load course details. Try again.')
        return
      }

      const course = catalogDetailToCourse(detail)
      if (!course) {
        setError('No tee data available for this course.')
        return
      }

      const hasCard = detail.tees.some(t => t.holes.length >= 9)
      if (hasCard && isCompleteCard(course)) {
        // Complete data — insert directly into Supabase
        const { count } = await supabase
          .from('courses')
          .select('id', { count: 'exact', head: true })
          .eq('name', course.name)
        if (count && count > 0) {
          setAdded(prev => new Set(prev).add(result.id))
          return
        }
        const { error: err } = await supabase.from('courses').insert(courseToRow(course, userId))
        if (err) throw err
        setAdded(prev => new Set(prev).add(result.id))
        setTimeout(onDone, 600)
      } else {
        // Partial data — pre-fill CourseSetup
        if (onPrefillCourse) {
          onPrefillCourse(course)
        }
      }
    } catch {
      setError(`Failed to import course. Please try again.`)
    } finally {
      setApiImporting(null)
    }
  }

  // Search goes through the course-search function; there is no client key.
  const hasApiKey = true

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
      <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
        <button
          onClick={onDone}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-600 text-xl"
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="text-xl font-bold">Course Catalog</h1>
      </header>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        {/* Search */}
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search 30,000+ courses or a city…"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            className="w-full h-12 pl-11 pr-4 rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Search-first empty state */}
        {hasApiKey && !query.trim() && (
          <div className="text-center py-8">
            <p className="text-4xl mb-3">🌐</p>
            <p className="text-gray-600 dark:text-gray-300 font-semibold">Search 30,000+ courses</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Type a course name, city, or state to search</p>
          </div>
        )}

        {/* API Search Results (shown first when searching) */}
        {hasApiKey && query.trim().length >= 2 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1 flex items-center gap-2">
              Search Results
              {apiSearching && (
                <span className="w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin inline-block" />
              )}
            </h2>
            {!apiSearching && apiResults.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400 dark:text-gray-500 mb-2">No courses found for "{query}"</p>
                <button onClick={onAddCustom} className="text-sm text-amber-600 font-semibold underline">
                  Don't see your course? Create it manually
                </button>
              </div>
            )}
            <div className="space-y-2">
              {apiResults.map(result => {
                const isImporting = apiImporting === result.id
                const isAdded = added.has(result.id)
                return (
                  <button
                    key={result.id}
                    onClick={() => handleApiImport(result)}
                    disabled={isImporting || isAdded}
                    className={`w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border text-left px-4 py-4 flex items-center gap-4 transition-all
                      ${isAdded ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/30' : 'border-gray-100 dark:border-gray-700 active:bg-gray-50 dark:active:bg-gray-700'}
                      ${isImporting ? 'opacity-70' : ''}
                    `}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-xl
                      ${isAdded ? 'bg-amber-100' : 'bg-blue-50 dark:bg-blue-900/30'}`}>
                      {isAdded ? '✓' : '🌐'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm leading-tight ${isAdded ? 'text-green-800' : 'text-gray-900 dark:text-gray-100'}`}>
                        {result.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {[result.city, result.state].filter(Boolean).join(', ')}
                        {(result.teeCount ?? 0) > 0 && ` · ${result.teeCount} tees`}
                      </p>
                    </div>
                    {isImporting ? (
                      <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    ) : isAdded ? (
                      <span className="text-amber-600 font-semibold text-sm flex-shrink-0">Added</span>
                    ) : (
                      <span className="text-blue-600 font-semibold text-sm flex-shrink-0">+ Import</span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Local Courses (shown as subsection when API key present, primary when not) */}
        {(!hasApiKey || query.trim()) && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">
            {hasApiKey ? 'Local Courses' : query.trim() ? 'Matching Courses' : 'Featured Courses'}
          </h2>

          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <div className="flex justify-center mb-2 text-navy dark:text-cream">
                <Seal size={28} outer="currentColor" letter="currentColor" />
              </div>
              <p className="font-medium">No local courses match "{query}"</p>
            </div>
          )}

          {cities.map(city => (
            <div key={city} className="mb-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{city}</h3>
              <div className="space-y-2">
                {filtered.filter(c => c.city === city).map(course => {
                  const par = totalPar(course.holes)
                  const isAdding = adding === course.name
                  const isAdded = added.has(course.name)

                  return (
                    <button
                      key={course.name}
                      onClick={() => handleAdd(course.name)}
                      disabled={isAdding || isAdded}
                      className={`w-full bg-white rounded-2xl shadow-sm border text-left px-4 py-4 flex items-center gap-4 transition-all
                        ${isAdded
                          ? 'border-amber-300 bg-amber-50'
                          : 'border-gray-100 active:bg-gray-50'
                        }
                        ${isAdding ? 'opacity-70' : ''}
                      `}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-xl
                        ${isAdded ? 'bg-amber-100' : 'bg-gray-100'}`}>
                        {isAdded ? '✓' : '⛳'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm leading-tight ${isAdded ? 'text-green-800' : 'text-gray-900 dark:text-gray-100'}`}>
                          {course.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Par {par} · {course.tees.length} tees · {course.tees.map(t => t.name).join(', ')}
                        </p>
                      </div>
                      {isAdding ? (
                        <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      ) : isAdded ? (
                        <span className="text-amber-600 font-semibold text-sm flex-shrink-0">Added</span>
                      ) : (
                        <span className="text-amber-600 font-semibold text-sm flex-shrink-0">+ Add</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
        )}

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-2">
          Ratings sourced from USGA/Greenskeeper.org · Verify before posting handicap rounds
        </p>
      </div>

      {/* Add Custom Course button */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={onAddCustom}
            className="w-full h-14 border-2 border-green-700 text-amber-600 text-base font-bold rounded-2xl active:bg-amber-50 transition-colors"
          >
            + Add Custom Course
          </button>
        </div>
      </div>
    </div>
  )
}
