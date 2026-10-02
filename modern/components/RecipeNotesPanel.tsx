import { assetUrl } from '../lib/presentation'
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

const FESTIVAL_NOTE_ORDER = ['4040044', '4040043', '4040042', '4040047']
const FESTIVAL_NOTE_IDS = new Set(FESTIVAL_NOTE_ORDER)

type NoteView = RecipeNote & {
  outputItem?: number
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
        outputItem: output,
        outputName: output == null ? undefined : DATA.items[String(output)]?.name,
      })
    } else if (!existing.outputItem && output != null) {
      existing.outputItem = output
      existing.outputName = DATA.items[String(output)]?.name
    }
  }

  const rv = (note: NoteView) => Number(UNLOCKS[String(note.item)]?.match(/\d+/)?.[0] || 999)
  return [...result.values()].sort((a, b) => rv(a) - rv(b) || a.name.localeCompare(b.name))
}

function itemIcon(item?: number) {
  return item == null ? '' : assetUrl(`/images/aniimo/database/materials/item_${item}.webp`)
}

export default function RecipeNotesPanel({ state, patch }: Props) {
  const all = notes()
  const byKey = new Map(all.map((note) => [String(note.item), note]))
  const standard = all.filter((note) => {
    const key = String(note.item)
    return !FESTIVAL_NOTE_IDS.has(key)
  })
  const festival = FESTIVAL_NOTE_ORDER.flatMap((key) => {
    const note = byKey.get(key)
    return note ? [note] : []
  })

  const enabledStandard = standard.filter((note) => state.recipeNotes[String(note.item)] !== false).length
  const enabledFestival = festival.filter((note) => state.recipeNotes[String(note.item)] !== false).length

  const renderNote = (note: NoteView) => {
    const key = String(note.item)
    const checked = state.recipeNotes[key] !== false
    const icon = itemIcon(note.outputItem)
    return (
      <label className="note-card" key={key}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => patch((draft) => { draft.recipeNotes[key] = event.target.checked })}
        />
        {icon && <img className="note-output-icon" src={icon} alt="" loading="lazy" />}
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
  }

  return (
    <section className="panel">
      <div className="section-title"><span /><h3>Recipe notes</h3><i /><em className="micro">{enabledStandard} of {standard.length} read</em></div>
      <div className="note-grid modern-note-grid">
        {standard.map(renderNote)}
      </div>

      <div className="section-title recipe-notes-festival-title"><span /><h3>Harvest Moon Festival</h3><i /><em className="micro">{enabledFestival} of {festival.length} read</em></div>
      <div className="note-grid modern-note-grid">
        {festival.map(renderNote)}
      </div>

      <p className="micro">Untick a note you have not read and every recipe gated by it disappears from the solver.</p>
    </section>
  )
}
