import { ArrowRight, Warehouse } from 'lucide-react'
import ObjectivePanel from '../components/ObjectivePanel'
import ResultsPanel from '../components/ResultsPanel'
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

  return (
    <div className="optimizer-page">
      <div className="optimizer-editor">
        <div className="context-strip">
          <div><Warehouse aria-hidden="true" /><span><small>Homeland</small><b>RV {state.homelandLevel}</b></span></div>
          <div><span><small>Facilities</small><b>{configured} configured</b></span></div>
          <div><span><small>Team slots</small><b>{state.teamSlots}</b></span></div>
          <a href="./homeland.html">Edit Homeland <ArrowRight aria-hidden="true" /></a>
        </div>

        <ObjectivePanel state={state} patch={patch} />

        <section className="surface-card solver-note">
          <span className="surface-eyebrow">How this page behaves</span>
          <h3>Economics here. Physical configuration elsewhere.</h3>
          <p>Change the objective or constraints and the plan recalculates immediately. Facility levels, modules and recipe unlocks stay on the Homeland page so this screen remains readable.</p>
        </section>
      </div>

      <div className="optimizer-results">
        <ResultsPanel plan={plan} progress={progress} running={running} error={error} />
      </div>
    </div>
  )
}
