import {
  ArrowRight, CheckCircle2, CircleAlert, Map, PawPrint,
  SlidersHorizontal, UsersRound, Warehouse,
} from 'lucide-react'
import { DATA } from '../state'
import { fmt } from '../lib/presentation'
import type { OptimizerPlan, OptimizerState, SolverProgress } from '../types'

type Props = {
  state: OptimizerState
  plan: OptimizerPlan | null
  progress: SolverProgress | null
  running: boolean
  error: string | null
}

const LINKS = [
  { href: './optimizer.html', label: 'Optimize production', detail: 'Objective, minimums, MAX goals and chosen production rows.', icon: SlidersHorizontal },
  { href: './homeland.html', label: 'Edit Homeland', detail: 'Facilities, modules, unlocks and operating rules.', icon: Warehouse },
  { href: './team.html', label: 'Build real team', detail: 'Owned roster, personality roles and anti-stall staffing.', icon: UsersRound },
  { href: './layout.html', label: 'Generate layout', detail: 'Physical plots, climate fields and compact placement.', icon: Map },
  { href: './roster.html', label: 'Manage roster', detail: 'Forms, copies and ability availability.', icon: PawPrint },
]

export default function OverviewPage({ state, plan, progress, running, error }: Props) {
  const activeFacilities = DATA.facilities.filter(
    (facility) => facility.kind !== 'utility' && Number(state.facilities[facility.slug]?.count || 0) > 0,
  ).length
  const owned = DATA.pals.filter((pal) => state.owned[String(pal.id)]?.enabled).length
  const rows = [...(plan?.rows || [])].sort((a, b) => b.perHour - a.perHour).slice(0, 6)
  const climateOk = plan?.climateLayout?.feasible !== false

  return (
    <div className="overview-grid">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="hero-kicker">Current optimized snapshot</span>
          <h2>{running ? 'Recalculating your Homeland…' : plan ? `${fmt(plan.ratePerHour)} Home Coin / h` : 'Your Homeland is ready to model.'}</h2>
          <p>
            {running
              ? progress?.detail || 'Searching production and climate candidates.'
              : error
                ? error
                : plan?.scenarioLabel || 'Configure the Homeland, then let the optimizer choose the profitable production mix.'}
          </p>
          <div className="hero-actions">
            <a className="ui-button primary" href="./optimizer.html">Open optimizer <ArrowRight aria-hidden="true" /></a>
            <a className="ui-button secondary" href="./layout.html">View physical layout</a>
          </div>
        </div>

        <div className="hero-metrics">
          <div className="metric-tile emphasis"><span>Home Coin / h</span><strong>{plan ? fmt(plan.ratePerHour) : '—'}</strong><small>{plan?.scenarioLabel || 'Awaiting plan'}</small></div>
          <div className="metric-tile"><span>Objective</span><strong>{plan ? fmt(plan.objectiveRate, 3) : '—'}</strong><small>{state.target === 'coin' ? 'Home Coin' : DATA.items[String(state.target)]?.name || 'Material'}</small></div>
          <div className="metric-tile"><span>Configured facilities</span><strong>{activeFacilities}</strong><small>RV {state.homelandLevel}</small></div>
          <div className="metric-tile"><span>Enabled Aniimo</span><strong>{owned}</strong><small>{state.teamSlots} real-team slots</small></div>
        </div>
      </section>

      <section className="surface-card health-card">
        <div className="surface-header">
          <div><span className="surface-eyebrow">Plan health</span><h3>Everything that can invalidate a solve, in one place.</h3></div>
          <span className={error ? 'status-badge danger' : 'status-badge'}>
            {error ? <CircleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            {error ? 'Needs attention' : running ? 'Checking' : 'Healthy'}
          </span>
        </div>
        <div className="health-list">
          <div><span>Production solver</span><b>{running ? 'Running' : plan ? 'Complete' : 'Waiting'}</b></div>
          <div><span>Climate geometry</span><b>{plan?.climateLayout ? (climateOk ? 'Feasible' : 'Blocked') : 'Not required'}</b></div>
          <div><span>Recipe mode</span><b>{state.oneRecipePerFacility ? 'One recipe / facility' : 'Mixed recipes allowed'}</b></div>
          <div><span>Recipe Notes</span><b>{Object.values(state.recipeNotes).filter((value) => value !== false).length} enabled</b></div>
        </div>
      </section>

      <section className="surface-card production-card">
        <div className="surface-header">
          <div><span className="surface-eyebrow">Top production</span><h3>What is carrying the current plan.</h3></div>
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
                    <td><b>{facility?.name || row.facility}</b></td>
                    <td>{output == null ? 'Recipe' : DATA.items[String(output)]?.name || String(output)}</td>
                    <td>{fmt(row.units, 2)}</td>
                    <td className="numeric">{fmt(row.perHour)}</td>
                  </tr>
                )
              }) : <tr><td colSpan={4} className="empty-cell">No plan rows yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workflow-grid">
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
    </div>
  )
}
