import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { ExternalLink, Github, RefreshCw, RotateCcw, Settings2 } from 'lucide-react'
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
        <PopoverPrimitive.Positioner
          side="right"
          align="end"
          sideOffset={12}
          collisionPadding={12}
          className="rewrite-popover-positioner"
        >
          <PopoverPrimitive.Popup className="rewrite-settings-popover">
            <header className="rewrite-settings-head">
              <span>PROJECT CONTROLS</span>
              <b>Optimizer</b>
              <small>{DATA.version || 'Game data'}</small>
            </header>

            <div className="rewrite-settings-group">
              <span className="rewrite-settings-group-label">Plan</span>
              <button className="rewrite-settings-action" type="button" onClick={onSolve} disabled={running}>
                <span className="rewrite-settings-action-icon"><RefreshCw aria-hidden="true" /></span>
                <span className="rewrite-settings-action-copy">
                  <b>{running ? 'Plan is running' : 'Re-run plan'}</b>
                  <small>Ignore the exact-state cache once and solve again.</small>
                </span>
              </button>
              <button className="rewrite-settings-action" type="button" onClick={reset}>
                <span className="rewrite-settings-action-icon"><RotateCcw aria-hidden="true" /></span>
                <span className="rewrite-settings-action-copy">
                  <b>Reset data</b>
                  <small>Restore every optimizer input to the project defaults.</small>
                </span>
              </button>
            </div>

            <div className="rewrite-settings-group">
              <span className="rewrite-settings-group-label">Project</span>
              <a
                className="rewrite-settings-action"
                href="https://github.com/Eisenrot/aniimo-homeland-optimizer"
                target="_blank"
                rel="noreferrer"
              >
                <span className="rewrite-settings-action-icon"><Github aria-hidden="true" /></span>
                <span className="rewrite-settings-action-copy">
                  <b>GitHub source</b>
                  <small>Repository, source history, and development notes.</small>
                </span>
                <ExternalLink className="rewrite-settings-external" aria-hidden="true" />
              </a>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
