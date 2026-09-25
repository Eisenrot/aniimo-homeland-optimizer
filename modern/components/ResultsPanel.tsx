import { facilityAsset, itemIcon } from '../lib/presentation'
import PersistentCollapse from './PersistentCollapse'
import { DATA } from '../state'
import type { OptimizerPlan, PlanRow, SolverProgress } from '../types'

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

function groupedRows(rows: PlanRow[]) {
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

  return order.flatMap((facility) =>
    (groups.get(facility) || [])
      .sort((a, b) => Number(b.perHour || 0) - Number(a.perHour || 0))
      .map((row, index) => ({ row, continued: index > 0 })),
  )
}

type Props = {
  plan: OptimizerPlan | null
  progress: SolverProgress | null
  running: boolean
  error: string | null
}

export default function ResultsPanel({ plan, progress, running, error }: Props) {
  const stats = plan?.optimizerStats
  const pct = Math.max(0, Math.min(100, Number(progress?.progress || (running ? 0 : 1)) * 100))
  const rows = groupedRows(plan?.rows || [])
  const engine = stats?.engine === 'cache'
    ? 'EXACT CACHE'
    : stats?.engine === 'main'
      ? 'MAIN THREAD'
      : 'WORKER SOLVE'

  return (
    <>
      <PersistentCollapse id="best-plan" label="Best plan">
      <section className="panel result-overview-panel">
        <div className="section-title"><span /><h3>Best plan</h3><i /><em className="micro">{engine}</em></div>

        {running && (
          <div className="modern-progress">
            <div><b>{progress?.phase || 'Searching'}</b><span>{progress?.detail || 'Evaluating legal plans…'}</span></div>
            <progress value={pct} max={100} />
            <small>
              {progress?.scenarioTotal ? `${progress.scenarioIndex || 0}/${progress.scenarioTotal} scenarios · ` : ''}
              {fmt(progress?.candidatePlans || 0, 0)} candidates · {fmt((progress?.elapsedMs || 0) / 1000, 2)}s
            </small>
          </div>
        )}

        {error && <div className="modern-error">{error}</div>}

        {!running && plan && (
          <>
            <div className="modern-kpis">
              <div className="kpi-coin">
                <img src={itemIcon('coin')} alt="" />
                <span><small>Home Coin / h</small><strong>{fmt(plan.ratePerHour)}</strong></span>
              </div>
              <div><small>Target / h</small><strong>{fmt(plan.targetRate)}</strong></div>
              <div><small>Objective</small><strong>{fmt(plan.objectiveRate, 3)}</strong></div>
              <div><small>Solve</small><strong>{stats?.engine === 'cache' ? 'cached' : `${fmt((stats?.elapsedMs || 0) / 1000, 2)}s`}</strong></div>
            </div>
            <div className="micro modern-stats">
              {stats?.candidatePlans || 0} candidates · {stats?.climateOffsets || 0} geometry checks · {plan.scenarioLabel || 'No utility scenario'}
            </div>
          </>
        )}
      </section>
      </PersistentCollapse>

      <PersistentCollapse id="production-rows" label="Production rows">
      <section className="panel">
        <div className="section-title"><span /><h3>Production rows</h3><i /><em>{rows.length ? `${rows.length} ACTIVE` : ''}</em></div>
        {!rows.length ? (
          <div className="empty">{running ? 'Solver is working…' : 'No active production rows yet.'}</div>
        ) : (
          <div className="modern-table-wrap production-table-wrap">
            <table className="modern-table production-table">
              <thead><tr><th>Facility</th><th>Output</th><th>Batches / h</th><th>Use</th><th className="numeric">Coin / h</th></tr></thead>
              <tbody>
                {rows.map(({ row, continued }, index) => {
                  const facility = DATA.facilities.find((item) => item.slug === row.facility)
                  const output = outputId(row)
                  return (
                    <tr className={rowClasses(row, continued)} key={`${row.facility}:${row.recipe.id}:${index}`}>
                      <td>
                        <span className={continued ? 'table-identity grouped-facility continued' : 'table-identity grouped-facility'}>
                          {continued && <span className="facility-group-arrow" aria-hidden="true">↳</span>}
                          {facility?.icon && <img src={facilityAsset(facility)} alt="" />}
                          <b>{facility?.name || row.facility}</b>
                        </span>
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
      </PersistentCollapse>

      {plan?.climateLayout && (
        <PersistentCollapse id="climate-geometry" label="Climate geometry">
        <section className="panel">
          <div className="section-title">
            <span />
            <h3>Climate geometry</h3>
            <i />
            <em>{plan.climateLayout.feasible === false ? 'BLOCKED' : 'PHYSICAL OK'}</em>
          </div>
          <p className={plan.climateLayout.feasible === false ? 'modern-error' : 'micro'}>
            {plan.climateLayout.message || plan.climateLayout.status || 'No climate-sensitive production.'}
          </p>
        </section>
        </PersistentCollapse>
      )}
    </>
  )
}
