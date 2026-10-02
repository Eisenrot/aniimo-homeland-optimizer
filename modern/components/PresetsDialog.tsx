import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Copy, Library, Link2, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react'
import { useState } from 'react'
import {
  buildShareUrl,
  createPresetId,
  readPresets,
  snapshotPresetState,
  writePresets,
  type OptimizerPreset,
  type PresetSnapshot,
} from '../presets'
import { DATA } from '../state'
import type { OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  onLoadPreset: (snapshot: PresetSnapshot) => void
}

function targetName(target: string) {
  return target === 'coin' ? 'Home Coin' : DATA.items[String(target)]?.name || String(target)
}

function presetMeta(preset: OptimizerPreset) {
  const state = preset.state
  return `RV ${state.homelandLevel} · ${targetName(state.target)} · ${state.teamSlots} Aniimo`
}

function updatedLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
}

export default function PresetsDialog({ state, onLoadPreset }: Props) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<OptimizerPreset[]>(() => readPresets())
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const persist = (next: OptimizerPreset[]) => {
    const sorted = [...next].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    setPresets(sorted)
    writePresets(sorted)
  }

  const saveCurrent = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setNotice('Give the preset a name first.')
      return
    }
    if (presets.some((preset) => preset.name.localeCompare(trimmed, undefined, { sensitivity: 'accent' }) === 0)) {
      setNotice('That name already exists. Use Update on the existing preset.')
      return
    }
    const now = new Date().toISOString()
    persist([{
      id: createPresetId(),
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      state: snapshotPresetState(state),
    }, ...presets])
    setName('')
    setPendingDelete(null)
    setNotice(`Saved “${trimmed}”.`)
  }

  const updatePreset = (preset: OptimizerPreset) => {
    const now = new Date().toISOString()
    persist(presets.map((entry) => entry.id === preset.id
      ? { ...entry, updatedAt: now, state: snapshotPresetState(state) }
      : entry))
    setPendingDelete(null)
    setNotice(`Updated “${preset.name}” with the current setup.`)
  }

  const requestDelete = (preset: OptimizerPreset) => {
    if (pendingDelete !== preset.id) {
      setPendingDelete(preset.id)
      setNotice(`Press delete again to remove “${preset.name}”.`)
      return
    }
    persist(presets.filter((entry) => entry.id !== preset.id))
    setPendingDelete(null)
    setNotice(`Deleted “${preset.name}”.`)
  }

  const loadPreset = (preset: OptimizerPreset) => {
    onLoadPreset(preset.state)
    setPendingDelete(null)
    setOpen(false)
  }

  const share = async () => {
    await copyText(buildShareUrl(state))
    setPendingDelete(null)
    setNotice('Share link copied.')
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger className="rewrite-dock-action" aria-label="Presets and share">
        <Library aria-hidden="true" />
        <span>Presets</span>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="rewrite-dialog-backdrop" />
        <DialogPrimitive.Viewport className="rewrite-dialog-viewport">
          <DialogPrimitive.Popup className="rewrite-presets-dialog">
            <header className="rewrite-dialog-header">
              <div>
                <DialogPrimitive.Title>Presets & share</DialogPrimitive.Title>
                <DialogPrimitive.Description>
                  Save plan setups and switch between them instantly. Your Owned Aniimo roster stays global and is never stored in a preset or share link.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="rewrite-dialog-close" aria-label="Close presets">
                <X aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>

            <div className="rewrite-presets-panel">
              <section className="preset-create-block">
                <div className="preset-block-heading">
                  <div>
                    <small>CURRENT SETUP</small>
                    <b>Save as preset</b>
                  </div>
                  <span>RV {state.homelandLevel} · {targetName(state.target)} · {state.teamSlots} Aniimo</span>
                </div>
                <div className="preset-create-row">
                  <label className="preset-name-field">
                    <span>Preset name</span>
                    <input
                      value={name}
                      maxLength={64}
                      placeholder="e.g. Harvest Moon"
                      onChange={(event) => {
                        setName(event.target.value)
                        setNotice('')
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          saveCurrent()
                        }
                      }}
                    />
                  </label>
                  <button className="preset-primary-action" type="button" onClick={saveCurrent}>
                    <Save aria-hidden="true" />
                    Save current
                  </button>
                </div>
              </section>

              <section className="preset-list-block">
                <div className="preset-block-heading">
                  <div>
                    <small>SAVED LOCALLY</small>
                    <b>Presets</b>
                  </div>
                  <span>{presets.length} saved</span>
                </div>

                {presets.length ? (
                  <div className="preset-list">
                    {presets.map((preset) => (
                      <article className="preset-row" key={preset.id}>
                        <div className="preset-row-copy">
                          <b>{preset.name}</b>
                          <small>{presetMeta(preset)}</small>
                          <em>{updatedLabel(preset.updatedAt)}</em>
                        </div>
                        <div className="preset-row-actions">
                          <button type="button" className="preset-load-action" onClick={() => loadPreset(preset)}>
                            <Upload aria-hidden="true" />
                            Load
                          </button>
                          <button
                            type="button"
                            className="preset-icon-action"
                            aria-label={`Update ${preset.name} with current setup`}
                            title="Update with current setup"
                            onClick={() => updatePreset(preset)}
                          >
                            <RefreshCw aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={pendingDelete === preset.id ? 'preset-icon-action danger confirm' : 'preset-icon-action danger'}
                            aria-label={pendingDelete === preset.id ? `Confirm delete ${preset.name}` : `Delete ${preset.name}`}
                            title={pendingDelete === preset.id ? 'Press again to confirm' : 'Delete preset'}
                            onClick={() => requestDelete(preset)}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="preset-empty">
                    <Library aria-hidden="true" />
                    <div>
                      <b>No presets yet.</b>
                      <small>Save the current setup above and it will live here.</small>
                    </div>
                  </div>
                )}
              </section>

              <section className="preset-share-block">
                <div className="preset-share-copy">
                  <span className="preset-share-icon"><Link2 aria-hidden="true" /></span>
                  <div>
                    <small>SHARE CURRENT SETUP</small>
                    <b>Copy a loadable link</b>
                    <span>Plan settings only. Roster, theme, caches and other local data stay yours.</span>
                  </div>
                </div>
                <button className="preset-share-action" type="button" onClick={() => void share()}>
                  <Copy aria-hidden="true" />
                  Copy share link
                </button>
              </section>

              <div className="preset-live-status" role="status" aria-live="polite">
                {notice}
              </div>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
