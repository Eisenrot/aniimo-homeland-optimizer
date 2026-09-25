import { ArrowRight, Coins, Gauge, Target, Warehouse } from 'lucide-react'
import ObjectivePanel from '../components/ObjectivePanel'
import ResultsPanel from '../components/ResultsPanel'
import { fmt, itemIcon } from '../lib/presentation'
import { DATA } from '../state'
import type { OptimizerPlan, OptimizerState, SolverProgress } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
  plan: OptimizerPlan | null
  progress: SolverProgress | null
  running: boolean
  error: string | null
}

export default function OptimizerPage({ state, patch, plan, progress, running, error }: Props) {
  const configured = DATA.facilities.filter(
    (facility) => facility.kind !== 'utility' && Number(state.facilities[facility.slug]?.count || 0) > 0,
  ).length
  const targetName = state.target === 'coin'
    ? 'Home Coin'
    : DATA.items[String(state.target)]?.name || 'Material'
  const activeRequirements = state.guarantees.filter((item) => item.enabled !== false)
  const maxGoals = activeRequirements.filter((item) => item.maximize).length

  return (
    <div className="optimizer-page">
      <section className="optimizer-focus">
        <div className="optimizer-focus-target">
          <span className="optimizer-target-art">
            <img src={itemIcon(state.target)} alt="" />
          </span>
          <span>
            <small>Primary objective</small>
            <strong>{targetName}</strong>
            <em>{running ? progress?.phase || 'Optimizing…' : plan ? `${fmt(plan.objectiveRate, 3)} objective / h` : 'Ready to solve'}</em>
          </span>
        </div>

        <div className="optimizer-focus-metrics">
          <div><Coins aria-hidden="true" /><span><small>Home Coin</small><b>{plan ? `${fmt(plan.ratePerHour)} / h` : '—'}</b></span></div>
          <div><Target aria-hidden="true" /><span><small>Constraints</small><b>{activeRequirements.length}</b></span></div>
          <div><Gauge aria-hidden="true" /><span><small>Co-MAX</small><b>{maxGoals}</b></span></div>
        </div>
      </section>

      <div className="optimizer-editor">
        <div className="context-strip">
          <div><Warehouse aria-hidden="true" /><span><small>Homeland</small><b>RV {state.homelandLevel}</b></span></div>
          <div><span><small>Facilities</small><b>{configured} configured</b></span></div>
          <div><span><small>Team</small><b>{state.teamSlots} Aniimo</b></span></div>
          <a href="./homeland.html">Edit Homeland <ArrowRight aria-hidden="true" /></a>
        </div>

        <ObjectivePanel state={state} patch={patch} />

        <div className="optimizer-rule-strip">
          <span><b>MIN</b> hard requirement</span>
          <span><b>MAX</b> joint objective</span>
          <span><b>AUTO</b> recalculates on change</span>
        </div>
      </div>

      <div className="optimizer-results">
        <ResultsPanel plan={plan} progress={progress} running={running} error={error} />
      </div>
    </div>
  )
}
