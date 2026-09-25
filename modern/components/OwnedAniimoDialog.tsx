import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { PawPrint, X } from 'lucide-react'
import RosterPage from '../pages/RosterPage'
import type { OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

export default function OwnedAniimoDialog({ state, patch }: Props) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger className="rewrite-dock-action" aria-label="Aniimo you own">
        <PawPrint aria-hidden="true" />
        <span>Owned</span>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="rewrite-dialog-backdrop" />
        <DialogPrimitive.Viewport className="rewrite-dialog-viewport">
          <DialogPrimitive.Popup className="rewrite-owned-dialog">
            <header className="rewrite-dialog-header">
              <div>
                <DialogPrimitive.Title>Aniimo you own</DialogPrimitive.Title>
                <DialogPrimitive.Description>
                  Forms and copies stay independent. This roster feeds Real Team automatically.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="rewrite-dialog-close" aria-label="Close Aniimo roster">
                <X aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>
            <div className="rewrite-dialog-panel">
              <RosterPage state={state} patch={patch} />
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
