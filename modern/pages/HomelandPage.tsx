import FacilitiesPanel from '../components/FacilitiesPanel'
import ModulesPanel from '../components/ModulesPanel'
import PlanSettings from '../components/PlanSettings'
import RecipeNotesPanel from '../components/RecipeNotesPanel'
import type { OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

export default function HomelandPage({ state, patch }: Props) {
  return (
    <div className="homeland-layout">
      <section className="homeland-primary">
        <PlanSettings state={state} patch={patch} />
        <FacilitiesPanel state={state} patch={patch} />
      </section>
      <aside className="homeland-secondary">
        <ModulesPanel state={state} patch={patch} />
        <RecipeNotesPanel state={state} patch={patch} />
      </aside>
    </div>
  )
}
