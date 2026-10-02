import { facilityAsset, itemIcon } from '../lib/presentation'
import { DATA } from '../state'
import { productionPlacementCounts } from '../../src/climate.js'
import type { OptimizerPlan, OptimizerState, PlanRow, SolverProgress } from '../types'

function fmt(value: number, digits = 1) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function outputId(row: PlanRow) {
  return row.recipe.outputs?.[0]?.item
}

function outputName(row: PlanRow) {
  const id = outputId(row)
  return id == null ? 'Recipe' : DATA.items[String(id)]?.name || String(id)
}

function rowEnvironment(row: PlanRow) {
  const environment = Object.prototype.hasOwnProperty.call(row, 'effectiveEnv')
    ? row.effectiveEnv
    : row.recipe.env
  return String(environment || '').toLowerCase()
}

function rowUtilitySlugs(row: PlanRow, plan: OptimizerPlan | null) {
  const utilities: string[] = []
  const environment = rowEnvironment(row)
  const scenario = plan?.scenario || {}
  const coolingUnits = Array.isArray(scenario.coolingUnits)
    ? scenario.coolingUnits.map(String)
    : scenario.cooling ? [String(scenario.cooling)] : []
  const heatUnits = Array.isArray(scenario.heatUnits)
    ? scenario.heatUnits.map(String)
    : scenario.heat ? [String(scenario.heat)] : []

  if (environment === 'freeze') utilities.push('cooling-unit')
  else if (environment === 'scorching') utilities.push('heat-furnace')
  else if (environment === 'adequate') utilities.push('sunlamp')
  else if (environment === 'cool') {
    if (coolingUnits.includes('Cool')) utilities.push('cooling-unit')
    else if (coolingUnits.includes('Freeze') && heatUnits.includes('Warm')) utilities.push('cooling-unit', 'heat-furnace')
    else utilities.push('cooling-unit')
  } else if (environment === 'warm') {
    if (heatUnits.includes('Warm')) utilities.push('heat-furnace')
    else if (coolingUnits.includes('Cool') && heatUnits.includes('Scorching')) utilities.push('cooling-unit', 'heat-furnace')
    else utilities.push('heat-furnace')
  }

  if (row.recipe.electric) utilities.push('crackle-generator')
  return [...new Set(utilities)]
}

function rowClasses(row: PlanRow, continued: boolean) {
  const classes = ['production-plan-row']
  if (continued) classes.push('facility-continuation')

  const environment = rowEnvironment(row)
  if (['freeze', 'cool', 'adequate', 'warm', 'scorching'].includes(environment)) {
    classes.push('climate-row', `climate-${environment}`)
  }
  if (row.recipe.electric) classes.push('climate-row', 'climate-electric')
  return classes.join(' ')
}

function groupedRows(rows: PlanRow[], state: OptimizerState) {
  const sorted = [...rows].sort((a, b) => Number(b.perHour || 0) - Number(a.perHour || 0))
  const groups = new Map<string, PlanRow[]>()
  const order: string[] = []

  for (const row of sorted) {
    if (!groups.has(row.facility)) {
      groups.set(row.facility, [])
      order.push(row.facility)
    }
    groups.get(row.facility)!.push(row)
  }

  return order.flatMap((facility) => {
    const group = (groups.get(facility) || [])
      .sort((a, b) => Number(b.perHour || 0) - Number(a.perHour || 0))
    const display = productionPlacementCounts(facility, group, state, DATA) as Map<PlanRow, number>
    return group.map((row, index) => ({
      row,
      continued: index > 0,
      displayCount: Number(display.get(row) || 0),
    }))
  })
}

type Props = {
  state: OptimizerState
  plan: OptimizerPlan | null
  progress: SolverProgress | null
  running: boolean
  error: string | null
}

export default function ResultsPanel({ state, plan, progress, running, error }: Props) {
  const hasProgress = Number.isFinite(progress?.progress)
  const pct = Math.max(0, Math.min(100, Number(progress?.progress || 0) * 100))
  const nextSolver = progress?.engine === 'highs-mip-next'
  const rows = groupedRows(plan?.rows || [], state)
  return (
    <>
      {running && (
        <div className="solver-inline-status modern-progress">
          <div><b>{progress?.phase || 'Searching'}</b><span>{progress?.detail || 'Evaluating legal plans…'}</span></div>
          {hasProgress ? <progress value={pct} max={100} /> : <progress />}
          <small>
            {nextSolver
              ? `${progress?.climateCuts || 0} climate cuts · ${fmt((progress?.elapsedMs || 0) / 1000, 2)}s`
              : `${progress?.scenarioTotal ? `${progress.scenarioIndex || 0}/${progress.scenarioTotal} scenarios · ` : ''}${fmt(progress?.candidatePlans || 0, 0)} candidates · ${fmt((progress?.elapsedMs || 0) / 1000, 2)}s`}
          </small>
        </div>
      )}

      {error && <div className="modern-error solver-inline-error">{error}</div>}

      <section className="panel">
        <div className="section-title"><span /><h3>Production rows</h3><i /><em>{rows.length ? `${rows.length} ACTIVE` : ''}</em></div>
        {!rows.length ? (
          <div className="empty">{running ? 'Solver is working…' : 'No active production rows yet.'}</div>
        ) : (
          <div className="modern-table-wrap production-table-wrap">
            <table className="modern-table production-table">
              <thead><tr><th>Facility</th><th className="production-utility-heading">Utilities</th><th>Output</th><th>Batches / h</th><th>Use</th><th className="numeric">Coin / h</th></tr></thead>
              <tbody>
                {rows.map(({ row, continued, displayCount }, index) => {
                  const facility = DATA.facilities.find((item) => item.slug === row.facility)
                  const output = outputId(row)
                  const utilitySlugs = rowUtilitySlugs(row, plan)
                  return (
                    <tr className={rowClasses(row, continued)} key={`${row.facility}:${row.recipe.id}:${index}`}>
                      <td>
                        <span className={continued ? 'table-identity grouped-facility continued' : 'table-identity grouped-facility'}>
                          {continued && <span className="facility-group-arrow" aria-hidden="true">↳</span>}
                          {facility?.icon && <img src={facilityAsset(facility)} alt="" />}
                          <b>{`${Math.max(1, displayCount)}× `}{facility?.name || row.facility}</b>
                        </span>
                      </td>
                      <td className="production-utility-cell">
                        {!!utilitySlugs.length && (
                          <span className="production-utility-glyphs" aria-label="Utilities used">
                            {utilitySlugs.map((slug) => {
                              const utility = DATA.facilities.find((item) => item.slug === slug)
                              return utility?.icon ? (
                                <img
                                  className={`production-utility-glyph utility-${slug}`}
                                  key={slug}
                                  src={facilityAsset(utility)}
                                  alt=""
                                  title={utility.name}
                                />
                              ) : null
                            })}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="table-identity">
                          {output != null && <img src={itemIcon(output)} alt="" />}
                          <span>{outputName(row)}</span>
                        </span>
                      </td>
                      <td>{fmt(row.batchesPerHour, 2)}</td>
                      <td>{fmt(row.units, 2)}</td>
                      <td className="numeric"><span className="coin-inline"><img src={itemIcon('coin')} alt="" />{fmt(row.perHour)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}