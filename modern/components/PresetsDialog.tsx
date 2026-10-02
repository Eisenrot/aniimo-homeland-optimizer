import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Check, Code2, CopyPlus, Library, Link2, Pencil, RefreshCw, Save, Star, Trash2, Upload, X } from 'lucide-react'
import { useState } from 'react'
import {
  buildShareCode,
  buildShareCodeFromSnapshot,
  buildShareUrl,
  buildShareUrlFromSnapshot,
  createPresetId,
  parseSharedPresetInput,
  readDefaultPresetId,
  readPresets,
  snapshotPresetState,
  writeDefaultPresetId,
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

function sameName(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
}

function uniqueName(base: string, presets: OptimizerPreset[], excludeId?: string) {
  const taken = (value: string) => presets.some((preset) => preset.id !== excludeId && sameName(preset.name, value))
  if (!taken(base)) return base
  let index = 2
  while (taken(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

export default function PresetsDialog({ state, onLoadPreset }: Props) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<OptimizerPreset[]>(() => {
    const initialDefault = readDefaultPresetId()
    return readPresets().sort((a, b) => {
      if (a.id === initialDefault && b.id !== initialDefault) return -1
      if (b.id === initialDefault && a.id !== initialDefault) return 1
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })
  })
  const [defaultId, setDefaultId] = useState<string | null>(() => readDefaultPresetId())
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [importValue, setImportValue] = useState('')
  const [importName, setImportName] = useState('')

  const persist = (next: OptimizerPreset[], preferredDefaultId = defaultId) => {
    const sorted = [...next].sort((a, b) => {
      if (a.id === preferredDefaultId && b.id !== preferredDefaultId) return -1
      if (b.id === preferredDefaultId && a.id !== preferredDefaultId) return 1
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })
    setPresets(sorted)
    writePresets(sorted)
  }

  const saveCurrent = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setNotice('Give the preset a name first.')
      return
    }
    if (presets.some((preset) => sameName(preset.name, trimmed))) {
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
    if (defaultId === preset.id) {
      setDefaultId(null)
      writeDefaultPresetId(null)
      persist(presets.filter((entry) => entry.id !== preset.id), null)
    } else {
      persist(presets.filter((entry) => entry.id !== preset.id))
    }
    setPendingDelete(null)
    setEditingId(null)
    setNotice(`Deleted “${preset.name}”.`)
  }

  const loadPreset = (preset: OptimizerPreset) => {
    onLoadPreset(preset.state)
    setPendingDelete(null)
    setOpen(false)
  }

  const startRename = (preset: OptimizerPreset) => {
    setEditingId(preset.id)
    setEditingName(preset.name)
    setPendingDelete(null)
    setNotice('')
  }

  const finishRename = (preset: OptimizerPreset) => {
    const trimmed = editingName.trim()
    if (!trimmed) {
      setNotice('Preset names cannot be empty.')
      return
    }
    if (presets.some((entry) => entry.id !== preset.id && sameName(entry.name, trimmed))) {
      setNotice('Another preset already uses that name.')
      return
    }
    const now = new Date().toISOString()
    persist(presets.map((entry) => entry.id === preset.id ? { ...entry, name: trimmed, updatedAt: now } : entry))
    setEditingId(null)
    setEditingName('')
    setNotice(`Renamed to “${trimmed}”.`)
  }

  const duplicatePreset = (preset: OptimizerPreset) => {
    const now = new Date().toISOString()
    const duplicateName = uniqueName(`${preset.name} copy`, presets)
    persist([{
      id: createPresetId(),
      name: duplicateName,
      createdAt: now,
      updatedAt: now,
      state: structuredClone(preset.state),
    }, ...presets])
    setNotice(`Duplicated as “${duplicateName}”.`)
  }

  const toggleDefault = (preset: OptimizerPreset) => {
    const next = defaultId === preset.id ? null : preset.id
    setDefaultId(next)
    writeDefaultPresetId(next)
    persist(presets, next)
    setNotice(next ? `“${preset.name}” is now the default preset.` : 'Default preset cleared.')
  }

  const importPreset = () => {
    const snapshot = parseSharedPresetInput(importValue)
    if (!snapshot) {
      setNotice('That is not a valid Homeland share code or share link.')
      return
    }
    const requested = importName.trim() || `Imported · RV ${snapshot.homelandLevel} · ${targetName(snapshot.target)}`
    const finalName = uniqueName(requested, presets)
    const now = new Date().toISOString()
    persist([{
      id: createPresetId(),
      name: finalName,
      createdAt: now,
      updatedAt: now,
      state: snapshot,
    }, ...presets])
    setImportValue('')
    setImportName('')
    setNotice(`Imported “${finalName}”.`)
  }

  const copyCurrentCode = async () => {
    const value = buildShareCode(state)
    await copyText(value)
    setNotice(`Share code copied · ${value.length.toLocaleString()} characters.`)
  }

  const copyCurrentLink = async () => {
    await copyText(buildShareUrl(state))
    setNotice('Compact share link copied.')
  }

  const copyPresetCode = async (preset: OptimizerPreset) => {
    const value = buildShareCodeFromSnapshot(preset.state)
    await copyText(value)
    setNotice(`“${preset.name}” code copied · ${value.length.toLocaleString()} characters.`)
  }

  const copyPresetLink = async (preset: OptimizerPreset) => {
    await copyText(buildShareUrlFromSnapshot(preset.state))
    setNotice(`“${preset.name}” link copied.`)
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
                  Save plan setups, import a friend's setup, or share a compact code. Your Owned Aniimo roster stays global.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="rewrite-dialog-close" aria-label="Close presets">
                <X aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>

            <div className="rewrite-presets-panel">
              <section className="preset-create-block">
                <div className="preset-block-heading">
                  <div><small>CURRENT SETUP</small><b>Save as preset</b></div>
                  <span>RV {state.homelandLevel} · {targetName(state.target)} · {state.teamSlots} Aniimo</span>
                </div>
                <div className="preset-create-row">
                  <label className="preset-name-field">
                    <span>Preset name</span>
                    <input
                      value={name}
                      maxLength={64}
                      placeholder="e.g. Harvest Moon"
                      onChange={(event) => { setName(event.target.value); setNotice('') }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          saveCurrent()
                        }
                      }}
                    />
                  </label>
                  <button className="preset-primary-action" type="button" onClick={saveCurrent}>
                    <Save aria-hidden="true" /> Save current
                  </button>
                </div>
              </section>

              <section className="preset-import-block">
                <div className="preset-block-heading">
                  <div><small>IMPORT</small><b>Code or share link</b></div>
                  <span>Old long links are still accepted.</span>
                </div>
                <div className="preset-import-grid">
                  <label className="preset-name-field preset-import-code">
                    <span>Paste code or URL</span>
                    <textarea
                      value={importValue}
                      placeholder="AH1.… or https://…/#code=…"
                      onChange={(event) => { setImportValue(event.target.value); setNotice('') }}
                    />
                  </label>
                  <label className="preset-name-field">
                    <span>Name after import</span>
                    <input
                      value={importName}
                      maxLength={64}
                      placeholder="optional"
                      onChange={(event) => setImportName(event.target.value)}
                    />
                  </label>
                  <button className="preset-primary-action" type="button" onClick={importPreset}>
                    <Upload aria-hidden="true" /> Import preset
                  </button>
                </div>
              </section>

              <section className="preset-list-block">
                <div className="preset-block-heading">
                  <div><small>SAVED LOCALLY</small><b>Presets</b></div>
                  <span>{presets.length} saved</span>
                </div>

                {presets.length ? (
                  <div className="preset-list">
                    {presets.map((preset) => (
                      <article className={preset.id === defaultId ? 'preset-row is-default' : 'preset-row'} key={preset.id}>
                        <div className="preset-row-copy">
                          {editingId === preset.id ? (
                            <div className="preset-rename-row">
                              <input
                                autoFocus
                                value={editingName}
                                maxLength={64}
                                onChange={(event) => setEditingName(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') finishRename(preset)
                                  if (event.key === 'Escape') setEditingId(null)
                                }}
                              />
                              <button className="preset-icon-action" type="button" title="Save rename" onClick={() => finishRename(preset)}>
                                <Check aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <b>{preset.name}{preset.id === defaultId ? <span className="preset-default-tag">DEFAULT</span> : null}</b>
                          )}
                          <small>{presetMeta(preset)}</small>
                          <em>{updatedLabel(preset.updatedAt)}</em>
                        </div>
                        <div className="preset-row-actions">
                          <button type="button" className="preset-load-action" onClick={() => loadPreset(preset)}>
                            <Upload aria-hidden="true" /> Load
                          </button>
                          <button type="button" className="preset-icon-action" title="Rename" aria-label={`Rename ${preset.name}`} onClick={() => startRename(preset)}>
                            <Pencil aria-hidden="true" />
                          </button>
                          <button type="button" className="preset-icon-action" title="Duplicate" aria-label={`Duplicate ${preset.name}`} onClick={() => duplicatePreset(preset)}>
                            <CopyPlus aria-hidden="true" />
                          </button>
                          <button type="button" className={preset.id === defaultId ? 'preset-icon-action active' : 'preset-icon-action'} title={preset.id === defaultId ? 'Clear default' : 'Make default'} aria-label={`Toggle default for ${preset.name}`} onClick={() => toggleDefault(preset)}>
                            <Star aria-hidden="true" />
                          </button>
                          <button type="button" className="preset-icon-action" title="Copy compact code" aria-label={`Copy code for ${preset.name}`} onClick={() => void copyPresetCode(preset)}>
                            <Code2 aria-hidden="true" />
                          </button>
                          <button type="button" className="preset-icon-action" title="Copy compact link" aria-label={`Copy link for ${preset.name}`} onClick={() => void copyPresetLink(preset)}>
                            <Link2 aria-hidden="true" />
                          </button>
                          <button type="button" className="preset-icon-action" title="Update with current setup" aria-label={`Update ${preset.name} with current setup`} onClick={() => updatePreset(preset)}>
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
                    <div><b>No presets yet.</b><small>Save the current setup above and it will live here.</small></div>
                  </div>
                )}
              </section>

              <section className="preset-share-block">
                <div className="preset-share-copy">
                  <span className="preset-share-icon"><Code2 aria-hidden="true" /></span>
                  <div>
                    <small>SHARE CURRENT SETUP</small>
                    <b>Code first, link when useful</b>
                    <span>Compact codes are made for chat. Links remain clickable and both formats load the same plan.</span>
                  </div>
                </div>
                <div className="preset-share-actions">
                  <button className="preset-share-action" type="button" onClick={() => void copyCurrentCode()}>
                    <Code2 aria-hidden="true" /> Copy code
                  </button>
                  <button className="preset-share-action" type="button" onClick={() => void copyCurrentLink()}>
                    <Link2 aria-hidden="true" /> Copy link
                  </button>
                </div>
              </section>

              <div className="preset-live-status" role="status" aria-live="polite">{notice}</div>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
