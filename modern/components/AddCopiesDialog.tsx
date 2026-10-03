import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { CopyPlus, X } from 'lucide-react'
import { useState } from 'react'
import { DATA } from '../state'
import { rosterType, rosterTypes, setOwnedCopiesForTypes } from '../../src/owned-copies.js'
import type { OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

const ROSTER_TYPES = rosterTypes(DATA.pals)

export default function AddCopiesDialog({ state, patch }: Props) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(8)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(() => new Set(ROSTER_TYPES))

  const affected = DATA.pals.filter((pal) => {
    const owned = state.owned[String(pal.id)]
    return Boolean(owned?.enabled) && !pal.unavailable && selectedTypes.has(rosterType(pal))
  }).length

  const toggleType = (type: string) => {
    setSelectedTypes((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const applyCopies = () => {
    const target = Math.min(99, Math.max(1, Math.floor(Number(count) || 1)))
    patch((draft) => {
      setOwnedCopiesForTypes(draft, DATA.pals, selectedTypes, target)
    })
    setCount(target)
    setOpen(false)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger className="ui-button secondary">
        <CopyPlus aria-hidden="true" />
        Add copies
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="rewrite-dialog-backdrop roster-copy-backdrop" />
        <DialogPrimitive.Viewport className="rewrite-dialog-viewport roster-copy-viewport">
          <DialogPrimitive.Popup className="roster-copy-dialog">
            <header className="rewrite-dialog-header">
              <div>
                <DialogPrimitive.Title>Add copies in bulk</DialogPrimitive.Title>
                <DialogPrimitive.Description>
                  Choose form types to change. Only Aniimo that are already enabled are touched.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="rewrite-dialog-close" aria-label="Close copy editor">
                <X aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>

            <div className="roster-copy-body">
              <div className="roster-copy-count">
                <span>
                  <b>Set owned copies to</b>
                  <small>This is the total owned count, not +N.</small>
                </span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={count}
                  aria-label="Owned copies to set"
                  onChange={(event) => setCount(Math.min(99, Math.max(1, Number(event.target.value) || 1)))}
                />
              </div>

              <div className="roster-copy-types-head">
                <span>
                  <b>Form types</b>
                  <small>{selectedTypes.size}/{ROSTER_TYPES.length} selected · {affected} enabled Aniimo affected</small>
                </span>
                <div>
                  <button className="ghost" type="button" onClick={() => setSelectedTypes(new Set(ROSTER_TYPES))}>All</button>
                  <button className="ghost" type="button" onClick={() => setSelectedTypes(new Set())}>None</button>
                </div>
              </div>

              <div className="roster-copy-types">
                {ROSTER_TYPES.map((type) => {
                  const total = DATA.pals.filter((pal) => rosterType(pal) === type && !pal.unavailable).length
                  const enabled = DATA.pals.filter((pal) =>
                    rosterType(pal) === type
                    && !pal.unavailable
                    && state.owned[String(pal.id)]?.enabled).length
                  return (
                    <label className={selectedTypes.has(type) ? 'selected' : ''} key={type}>
                      <input type="checkbox" checked={selectedTypes.has(type)} onChange={() => toggleType(type)} />
                      <span>
                        <b>{type}</b>
                        <small>{enabled} enabled · {total} available</small>
                      </span>
                    </label>
                  )
                })}
              </div>

              <div className="roster-copy-actions">
                <span>{affected ? `${affected} enabled Aniimo will become Owned: ${count}` : 'Nothing selected will be changed.'}</span>
                <DialogPrimitive.Close className="ui-button ghost">Cancel</DialogPrimitive.Close>
                <button className="ui-button primary" type="button" disabled={!affected || !selectedTypes.size} onClick={applyCopies}>
                  Set copies
                </button>
              </div>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
