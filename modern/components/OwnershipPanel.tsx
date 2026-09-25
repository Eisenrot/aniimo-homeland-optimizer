import { useMemo, useState } from 'react'
import { DATA } from '../state'
import type { OptimizerState, Pal } from '../types'

type Props = {
  open: boolean
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
  onClose: () => void
}

const ABILITY_LOOKUP = new Map(
  Object.keys(DATA.abilities || {}).map((name) => [name.toLowerCase(), name]),
)

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

  const tokens = query
    .replace(/\s*(<=|>=|=|<|>)\s*/g, '$1')
    .split(/[\s,]+/)
    .filter(Boolean)

  const abilityRules: Array<{ ability: string; tests: Array<{ op: string; target: number }> }> = []
  const globalTests: Array<{ op: string; target: number }> = []
  const nameTerms: string[] = []

  for (const token of tokens) {
    const fused = token.match(/^([a-z][a-z-]*)(<=|>=|=|<|>)(\d+)$/i)
    if (fused && ABILITY_LOOKUP.has(fused[1].toLowerCase())) {
      abilityRules.push({
        ability: ABILITY_LOOKUP.get(fused[1].toLowerCase())!,
        tests: [{ op: fused[2], target: Number(fused[3]) }],
      })
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

    nameTerms.push(token)
  }

  const searchable = [
    pal.name,
    pal.speciesName,
    String(pal.form || ''),
  ].join(' ').toLowerCase()

  if (nameTerms.some((term) => !searchable.includes(term))) return false

  const abilities = pal.abilities || {}
  const passes = (value: number, tests: Array<{ op: string; target: number }>) =>
    tests.every((test) => compareLevel(value, test.op, test.target))

  if (abilityRules.length) {
    return abilityRules.every((rule) => {
      const value = Number(abilities[rule.ability] || 0)
      return value > 0 && passes(value, [...rule.tests, ...globalTests])
    })
  }

  if (globalTests.length) {
    return Object.values(abilities).some((value) => {
      const level = Number(value || 0)
      return level > 0 && passes(level, globalTests)
    })
  }

  return true
}

export default function OwnershipPanel({ open, state, patch, onClose }: Props) {
  const [query, setQuery] = useState('')

  const visible = useMemo(
    () => DATA.pals.filter((pal) => matchesFilter(pal, query)),
    [query],
  )

  const enabled = DATA.pals.filter((pal) => state.owned[String(pal.id)]?.enabled)
  const copies = enabled.reduce(
    (sum, pal) => sum + Number(state.owned[String(pal.id)]?.count || 1),
    0,
  )
  const forms = enabled.filter((pal) => pal.isForm).length

  if (!open) return null

  return (
    <div
      className="ownership-overlay open"
      aria-hidden="false"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <div className="ownership-modal modern-roster-modal" role="dialog" aria-modal="true" aria-label="Aniimo you own">
        <button className="modal-close" aria-label="Close Aniimo roster" onClick={onClose}>×</button>
        <section className="panel ownership-modal-panel">
          <div className="section-title">
            <span />
            <h3>Aniimo you own</h3>
            <i />
            <em className="micro">{enabled.length} enabled · {forms} forms · {copies} copies</em>
          </div>

          <div className="ownership-tools">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, form, ability or level… e.g. Prismana, Light, >=2"
            />
            <button
              className="ghost"
              onClick={() => patch((draft) => {
                for (const pal of DATA.pals) {
                  draft.owned[String(pal.id)].enabled = !pal.unavailable
                }
              })}
            >
              All
            </button>
            <button
              className="ghost"
              onClick={() => patch((draft) => {
                for (const pal of DATA.pals) draft.owned[String(pal.id)].enabled = false
              })}
            >
              None
            </button>
          </div>

          <div className="ownership-filter-hint">
            Filter by species, form, ability, or level · <b>Prismana</b> · <b>Light</b> · <b>Light, &gt;=2</b>
          </div>

          <div className="modern-roster-grid">
            {visible.map((pal) => {
              const id = String(pal.id)
              const owned = state.owned[id] || { enabled: !pal.isForm && !pal.unavailable, count: 1 }
              const abilities = Object.entries(pal.abilities || {})

              return (
                <label
                  className={`modern-roster-row ${owned.enabled ? '' : 'off'} ${pal.unavailable ? 'unavailable' : ''}`}
                  key={id}
                >
                  <input
                    type="checkbox"
                    checked={owned.enabled}
                    disabled={Boolean(pal.unavailable)}
                    onChange={(event) => patch((draft) => {
                      draft.owned[id].enabled = event.target.checked
                    })}
                  />

                  <span className="modern-roster-name">
                    <b>{pal.speciesName || pal.name}</b>
                    <small>
                      {pal.isForm ? String(pal.form || 'Form') : 'Base'}
                      {pal.unavailable ? ' · unavailable' : ''}
                    </small>
                  </span>

                  <span className="modern-roster-abilities">
                    {abilities.map(([ability, level]) => (
                      <em key={ability}>{ability} Lv.{level}</em>
                    ))}
                  </span>

                  <input
                    className="modern-roster-count"
                    type="number"
                    min={1}
                    max={99}
                    value={owned.count}
                    disabled={Boolean(pal.unavailable)}
                    title="Copies"
                    onChange={(event) => patch((draft) => {
                      draft.owned[id].count = Math.max(1, Number(event.target.value) || 1)
                    })}
                  />
                </label>
              )
            })}
          </div>

          <div className="summary-line">
            <span>Each form is independent. Checkbox = usable; number = copies available.</span>
            <span>{visible.length}/{DATA.pals.length} shown</span>
          </div>
        </section>
      </div>
    </div>
  )
}
