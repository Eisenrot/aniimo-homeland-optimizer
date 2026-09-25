import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Map,
  PawPrint,
  SlidersHorizontal,
  UsersRound,
  Warehouse,
} from 'lucide-react'
import { facilityAsset, fmt, itemIcon } from '../lib/presentation'
import { DATA } from '../state'
import type { OptimizerPlan, OptimizerState, SolverProgress } from '../types'

type Props = {
  state: OptimizerState
  plan: OptimizerPlan | null
  progress: SolverProgress | null
  running: boolean
  error: string | null
}

const LINKS = [
  { href: './optimizer.html', label: 'Optimize', detail: 'Objectives and production', icon: SlidersHorizontal },
  { href: './homeland.html', label: 'Homeland', detail: 'Facilities and unlocks', icon: Warehouse },
  { href: './team.html', label: 'Real Team', detail: 'Workers and personalities', icon: UsersRound },
  { href: './layout.html', label: 'Layout', detail: 'Physical placement', icon: Map },
  { href: './roster.html', label: 'Roster', detail: 'Forms and copies', icon: PawPrint },
]

export default function OverviewPage({ state, plan, progress, running, error }: Props) {
  const activeFacilities = DATA.facilities.filter(
    (facility) => facility.kind !== 'utility' && Number(state.facilities[facility.slug]?.count || 0) > 0,
  ).length
  const owned = DATA.pals.filter((pal) => state.owned[String(pal.id)]?.enabled).length
  const rows = [...(plan?.rows || [])].sort((a, b) => b.perHour - a.perHour).slice(0, 5)
  const climateOk = plan?.climateLayout?.feasible !== false
  const targetIcon = itemIcon(state.target)

  return (
    <div className="overview-grid">
      <section className="hero-panel compact-hero">
        <div className="hero-copy">
          <span className="hero-kicker">Current plan</span>
          <h2 className="hero-rate">
            {plan && <img src={itemIcon('coin')} alt="" />}
            {running ? 'Recalculating…' : plan ? `${fmt(plan.ratePerHour)} / h` : 'Ready to optimize'}
          </h2>
          <p>{running ? progress?.detail || 'Searching legal plans…' : error || plan?.scenarioLabel || 'Configure your Homeland and run the optimizer.'}</p>
        </div>

        <div className="hero-metrics compact">
          <div className="metric-tile emphasis"><img src={targetIcon} alt="" /><span>Objective</span><strong>{plan ? fmt(plan.objectiveRate, 3) : '—'}</strong></div>
          <div className="metric-tile"><Warehouse aria-hidden="true" /><span>Facilities</span><strong>{activeFacilities}</strong><small>RV {state.homelandLevel}</small></div>
          <div className="metric-tile"><PawPrint aria-hidden="true" /><span>Aniimo</span><strong>{owned}</strong><small>{state.teamSlots} team slots</small></div>
        </div>
      </section>

      <section className="workflow-grid compact-workflow">
        {LINKS.map((item) => {
          const Icon = item.icon
          return (
            <a className="workflow-card" href={item.href} key={item.href}>
              <span className="workflow-icon"><Icon aria-hidden="true" /></span>
              <span><b>{item.label}</b><small>{item.detail}</small></span>
              <ArrowRight aria-hidden="true" className="workflow-arrow" />
            </a>
          )
        })}
      </section>

      <section className="surface-card health-card">
        <div className="surface-header compact-header">
          <div><span className="surface-eyebrow">Plan health</span><h3>{error ? 'Needs attention' : 'Everything important is valid.'}</h3></div>
          <span className={error ? 'status-badge danger' : 'status-badge'}>
            {error ? <CircleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            {error ? 'Blocked' : running ? 'Checking' : 'Healthy'}
          </span>
        </div>
        <div className="health-list">
          <div><span>Solver</span><b>{running ? 'Running' : plan ? 'Complete' : 'Waiting'}</b></div>
          <div><span>Climate</span><b>{plan?.climateLayout ? (climateOk ? 'Feasible' : 'Blocked') : 'Not required'}</b></div>
          <div><span>Recipes</span><b>{state.oneRecipePerFacility ? '1 per facility' : 'Mixed'}</b></div>
          <div><span>Notes</span><b>{Object.values(state.recipeNotes).filter((value) => value !== false).length} enabled</b></div>
        </div>
      </section>

      <section className="surface-card production-card">
        <div className="surface-header compact-header">
          <div><span className="surface-eyebrow">Top production</span><h3>What carries the plan.</h3></div>
          <a className="text-link" href="./optimizer.html">Full plan <ArrowRight aria-hidden="true" /></a>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Facility</th><th>Output</th><th>Use</th><th className="numeric">Coin / h</th></tr></thead>
            <tbody>
              {rows.length ? rows.map((row) => {
                const facility = DATA.facilities.find((item) => item.slug === row.facility)
                const output = row.recipe.outputs?.[0]?.item
                return (
                  <tr key={`${row.facility}:${row.recipe.id}`}>
                    <td><span className="table-identity">{facility?.icon && <img src={facilityAsset(facility)} alt="" />}<b>{facility?.name || row.facility}</b></span></td>
                    <td><span className="table-identity">{output != null && <img src={itemIcon(output)} alt="" />}<span>{output == null ? 'Recipe' : DATA.items[String(output)]?.name || String(output)}</span></span></td>
                    <td>{fmt(row.units, 2)}</td>
                    <td className="numeric"><span className="coin-inline"><img src={itemIcon('coin')} alt="" />{fmt(row.perHour)}</span></td>
                  </tr>
                )
              }) : <tr><td colSpan={4} className="empty-cell">No plan rows yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
