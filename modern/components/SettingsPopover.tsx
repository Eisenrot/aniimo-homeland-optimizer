import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { Github, History, RefreshCw, RotateCcw, Settings2 } from 'lucide-react'
import { DATA } from '../state'

type Props = {
  running: boolean
  onSolve: () => void
  onReset: () => void
}

export default function SettingsPopover({ running, onSolve, onReset }: Props) {
  const reset = () => {
    if (window.confirm('Reset the optimizer to project defaults?')) onReset()
  }

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger className="rewrite-icon-button" aria-label="Optimizer settings">
        <Settings2 aria-hidden="true" />
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={8} className="rewrite-popover-positioner">
          <PopoverPrimitive.Popup className="rewrite-settings-popover">
            <div className="rewrite-settings-head">
              <b>Optimizer</b>
              <small>{DATA.version || 'Game data'}</small>
            </div>
            <button type="button" onClick={onSolve} disabled={running}>
              <RefreshCw aria-hidden="true" />
              <span><b>Re-run plan</b><small>Ignore the exact-state cache once.</small></span>
            </button>
            <button type="button" onClick={reset}>
              <RotateCcw aria-hidden="true" />
              <span><b>Reset data</b><small>Restore the project defaults.</small></span>
            </button>
            <a href="./legacy.html">
              <History aria-hidden="true" />
              <span><b>Legacy reference</b><small>The original long-form UI.</small></span>
            </a>
            <a href="https://github.com/Eisenrot/aniimo-homeland-optimizer" target="_blank" rel="noreferrer">
              <Github aria-hidden="true" />
              <span><b>GitHub</b><small>Source and experimental branch.</small></span>
            </a>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
