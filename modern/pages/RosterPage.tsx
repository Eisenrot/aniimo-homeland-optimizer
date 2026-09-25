import { useMemo, useState } from 'react'
import { PawPrint, Search, UsersRound } from 'lucide-react'
import AbilityPill from '../components/AbilityPill'
import AniimoAvatar from '../components/AniimoAvatar'
import { DATA } from '../state'
import type { OptimizerState, Pal } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

const ABILITY_LOOKUP = new Map(Object.keys(DATA.abilities || {}).map((name) => [name.toLowerCase(), name]))

function compareLevel(level: number, op: string, target: number) {
  if (op === '>') return level > target
  if (op === '>=') return level >= target
  if (op === '<') return level < target
  if (op === '<=') return level <= target
  return level === target
}

function matchesFilter(pal: Pal, raw: string) {
  const query = raw.trim().toLowerCase()
  if (!query) return true
  const tokens = query.replace(/\s*(<=|>=|=|<|>)\s*/g, '$1').split(/[\s,]+/).filter(Boolean)
  const abilityRules: Array<{ ability: string; tests: Array<{ op: string; target: number }> }> = []
  const globalTests: Array<{ op: string; target: number }> = []
  const names: string[] = []

  for (const token of tokens) {
    const fused = token.match(/^([a-z][a-z-]*)(<=|>=|=|<|>)(\d+)$/i)
    if (fused && ABILITY_LOOKUP.has(fused[1].toLowerCase())) {
      abilityRules.push({ ability: ABILITY_LOOKUP.get(fused[1].toLowerCase())!, tests: [{ op: fused[2], target: Number(fused[3]) }] })
      continue
    }
    const ability = ABILITY_LOOKUP.get(token)
    if (ability) {
      abilityRules.push({ ability, tests: [] })
      continue
    }
    const level = token.match(/^(<=|>=|=|<|>)?(\d+)$/)
    if (level) {
      globalTests.push({ op: level[1] || '=', target: Number(level[2]) })
      continue
    }
    names.push(token)
  }

  const searchable = [pal.name, pal.speciesName, String(pal.form || '')].join(' ').toLowerCase()
  if (names.some((term) => !searchable.includes(term))) return false
  const abilities = pal.abilities || {}
  const passes = (value: number, tests: Array<{ op: string; target: number }>) => tests.every((test) => compareLevel(value, test.op, test.target))

  if (abilityRules.length) {
    return abilityRules.every((rule) => {
      const value = Number(abilities[rule.ability] || 0)
      return value > 0 && passes(value, [...rule.tests, ...globalTests])
    })
  }
  if (globalTests.length) return Object.values(abilities).some((value) => Number(value) > 0 && passes(Number(value), globalTests))
  return true
}

export default function RosterPage({ state, patch }: Props) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => DATA.pals.filter((pal) => matchesFilter(pal, query)), [query])
  const enabled = DATA.pals.filter((pal) => state.owned[String(pal.id)]?.enabled)
  const copies = enabled.reduce((sum, pal) => sum + Number(state.owned[String(pal.id)]?.count || 1), 0)
  const forms = enabled.filter((pal) => pal.isForm).length

  return (
    <div className="roster-page">
      <section className="roster-toolbar surface-card">
        <div className="search-box"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, form, ability or level…  Light >=2" aria-label="Filter Aniimo roster" /></div>
        <div className="roster-actions">
          <button className="ui-button secondary" type="button" onClick={() => patch((draft) => { for (const pal of DATA.pals) draft.owned[String(pal.id)].enabled = !pal.unavailable })}>Enable all</button>
          <button className="ui-button ghost" type="button" onClick={() => patch((draft) => { for (const pal of DATA.pals) draft.owned[String(pal.id)].enabled = false })}>Disable all</button>
        </div>
      </section>

      <section className="roster-summary-grid">
        <div className="metric-tile emphasis"><span>Enabled entries</span><strong>{enabled.length}</strong><small>{visible.length} currently shown</small></div>
        <div className="metric-tile"><span>Available copies</span><strong>{copies}</strong><small>Used by team search</small></div>
        <div className="metric-tile"><span>Enabled forms</span><strong>{forms}</strong><small>Forms remain independent</small></div>
        <div className="metric-tile"><span>Real-team slots</span><strong>{state.teamSlots}</strong><small>Configured on Homeland</small></div>
      </section>

      <section className="surface-card roster-grid-card">
        <div className="surface-header"><div><span className="surface-eyebrow">Owned Aniimo</span><h3>Forms and copies are independent resources.</h3></div><PawPrint aria-hidden="true" className="surface-icon" /></div>
        <div className="roster-grid">
          {visible.map((pal) => {
            const id = String(pal.id)
            const owned = state.owned[id] || { enabled: !pal.isForm && !pal.unavailable, count: 1 }
            return (
              <article className={`roster-card ${owned.enabled ? '' : 'disabled'} ${pal.unavailable ? 'unavailable' : ''}`} key={id}>
                <label className="roster-enable"><input type="checkbox" checked={owned.enabled} disabled={Boolean(pal.unavailable)} onChange={(event) => patch((draft) => { draft.owned[id].enabled = event.target.checked })} /><span /></label>
                <AniimoAvatar pal={pal} />
                <div className="roster-card-copy">
                  <span><b>{pal.speciesName || pal.name}</b><small>{pal.isForm ? String(pal.form || 'Form') : 'Base'}</small></span>
                  <div className="ability-chip-row">{Object.entries(pal.abilities || {}).map(([ability, level]) => <AbilityPill key={ability} ability={ability} level={level} compact />)}</div>
                </div>
                <label className="copy-field"><UsersRound aria-hidden="true" /><input type="number" min={1} max={99} value={owned.count} disabled={Boolean(pal.unavailable)} aria-label={`${pal.name} copies`} onChange={(event) => patch((draft) => { draft.owned[id].count = Math.max(1, Number(event.target.value) || 1) })} /></label>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
