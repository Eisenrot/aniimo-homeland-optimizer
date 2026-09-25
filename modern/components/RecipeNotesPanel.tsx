import { DATA } from '../state'
import type { OptimizerState, RecipeNote } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

const UNLOCKS: Record<string, string> = {
  '4040114': 'RV 7',
  '4040115': 'RV 9',
  '4040116': 'RV 12',
  '4040117': 'RV 16',
  '4040118': 'RV 18',
  '4040119': 'RV 19',
}

type NoteView = RecipeNote & {
  outputName?: string
}

function notes(): NoteView[] {
  const result = new Map<string, NoteView>()
  for (const recipe of DATA.recipes) {
    if (!recipe.note) continue
    const key = String(recipe.note.item)
    const output = recipe.outputs?.[0]?.item
    const existing = result.get(key)
    if (!existing) {
      result.set(key, {
        ...recipe.note,
        outputName: output == null ? undefined : DATA.items[String(output)]?.name,
      })
    } else if (!existing.outputName && output != null) {
      existing.outputName = DATA.items[String(output)]?.name
    }
  }

  const rv = (note: NoteView) => Number(UNLOCKS[String(note.item)]?.match(/\d+/)?.[0] || 999)
  return [...result.values()].sort((a, b) => rv(a) - rv(b) || a.name.localeCompare(b.name))
}

export default function RecipeNotesPanel({ state, patch }: Props) {
  const all = notes()
  const enabled = all.filter((note) => state.recipeNotes[String(note.item)] !== false).length

  return (
    <section className="panel">
      <div className="section-title"><span /><h3>Recipe notes</h3><i /><em className="micro">{enabled} of {all.length} read</em></div>
      <div className="note-grid modern-note-grid">
        {all.map((note) => {
          const key = String(note.item)
          const checked = state.recipeNotes[key] !== false
          return (
            <label className="note-card" key={key}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => patch((draft) => { draft.recipeNotes[key] = event.target.checked })}
              />
              <div className="note-body">
                <div className="note-main">
                  <div>
                    <b>{note.name.replace(/^Recipe Note:\s*/, '')}</b>
                    {note.outputName && <span className="note-unlocks">Unlocks {note.outputName}</span>}
                  </div>
                </div>
                <div className="note-unlock">Unlocked by <b>{UNLOCKS[key] || 'Recipe Note'}</b></div>
              </div>
            </label>
          )
        })}
      </div>
      <p className="micro">Untick a note you have not read and every recipe gated by it disappears from the solver.</p>
    </section>
  )
}
