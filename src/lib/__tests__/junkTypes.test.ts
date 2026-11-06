// The junk_records check constraint and the client's dot/junk types must not
// drift: on 6 November five Dots types were rejected with 23514 while the client
// showed them as awarded. This reads the migration that owns the constraint and
// checks every type the client can produce is in its allowed list.

import { describe, it, expect } from 'vitest'
import migrationSql from '../../../supabase/migrations/20261106120000_junk_type_allow_dots.sql?raw'
import { DOT_LABELS, JUNK_LABELS } from '../gameLogic'

function allowedJunkTypes(sql: string): string[] {
  const m = sql.match(/junk_records_junk_type_check\s+check\s*\(\s*junk_type\s*=\s*any\s*\(\s*array\s*\[([\s\S]*?)\]/i)
  if (!m) throw new Error('could not find the junk_type check constraint array in the migration')
  const out: string[] = []
  const re = /'([^']+)'/g
  let hit: RegExpExecArray | null
  while ((hit = re.exec(m[1])) !== null) out.push(hit[1])
  return out
}

describe('junk_records.junk_type constraint', () => {
  const allowed = allowedJunkTypes(migrationSql)

  it('allows every Dots type the client can send', () => {
    for (const dot of Object.keys(DOT_LABELS)) {
      expect(allowed, `dot type "${dot}" is missing from the migration`).toContain(dot)
    }
  })

  it('allows every Junks type the client can send', () => {
    for (const junk of Object.keys(JUNK_LABELS)) {
      expect(allowed, `junk type "${junk}" is missing from the migration`).toContain(junk)
    }
  })

  it('keeps the original five values', () => {
    expect(allowed).toEqual(expect.arrayContaining(['sandy', 'greenie', 'snake', 'barkie', 'ctp']))
  })
})
