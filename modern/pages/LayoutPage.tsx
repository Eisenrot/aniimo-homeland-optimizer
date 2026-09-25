import { useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, RefreshCw, RotateCw, Snowflake, SunMedium, ThermometerSun } from 'lucide-react'
import { LAYOUT_SETTINGS_STORE, PLOT_MATRIX, plotRect, readFullLayoutCache, unlockedPlotNumbers, writeFullLayoutCache } from '../../src/full-layout.js'
import { layoutClient } from '../engine/layoutClient'
import { assetUrl, fmt } from '../lib/presentation'
import { DATA } from '../state'
import type { BaseLayout, LayoutSettings, OptimizerPlan, OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  plan: OptimizerPlan | null
  planRunning: boolean
}

const BUILD_ID = `modern-layout-v2:${DATA.version || 'data'}`

const DEFAULT_SETTINGS: LayoutSettings = {
  compact: true,
  shape: 'auto',
  allowRotate: true,
  storageUnits: 1,
  disabledPlots: [],
}

function loadSettings(): LayoutSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(LAYOUT_SETTINGS_STORE) || 'null')
    return { ...DEFAULT_SETTINGS, ...(stored || {}) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function climateClass(type: string) {
  if (type === 'cooling') return 'cooling'
  if (type === 'heating') return 'heating'
  return 'adequate'
}

export default function LayoutPage({ state, plan, planRunning }: Props) {
  const [settings, setSettings] = useState<LayoutSettings>(() => loadSettings())
  const [layout, setLayout] = useState<BaseLayout | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const update = (patch: Partial<LayoutSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      localStorage.setItem(LAYOUT_SETTINGS_STORE, JSON.stringify(next))
      return next
    })
  }

  const build = async (force = false) => {
    if (!plan || planRunning) return
    if (!force) {
      const cached = readFullLayoutCache(localStorage, plan, state, settings, BUILD_ID)
      if (cached) {
        setLayout(cached as BaseLayout)
        setError(null)
        return
      }
    }
    setRunning(true)
    setError(null)
    try {
      const next = await layoutClient.build(state, plan, settings)
      setLayout(next)
      writeFullLayoutCache(localStorage, plan, state, settings, BUILD_ID, next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    if (!plan || planRunning) return
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void build(false), 220)
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current)
      layoutClient.cancel()
    }
  }, [plan, planRunning, settings])

  const unlocked = useMemo(() => unlockedPlotNumbers(state.homelandLevel), [state.homelandLevel])
  const disabled = new Set(settings.disabledPlots)
  const allPlotRects = unlocked.map((number) => plotRect(number)).filter(Boolean)
  const boardWidth = PLOT_MATRIX[0].length * 20
  const boardHeight = PLOT_MATRIX.length * 15

  return (
    <div className="layout-page">
      <section className="layout-toolbar surface-card">
        <div className="layout-controls">
          <label>
            <span>Layout style</span>
            <select value={settings.shape} onChange={(event) => update({ shape: event.target.value as LayoutSettings['shape'] })}>
              <option value="auto">Auto</option>
              <option value="compact">Compact</option>
              <option value="clusters">Clusters</option>
              <option value="rows">Rows</option>
              <option value="spread">Spread</option>
            </select>
          </label>
          <label>
            <span>Storage Units</span>
            <input type="number" min={0} max={24} value={settings.storageUnits} onChange={(event) => update({ storageUnits: Math.max(0, Math.min(24, Number(event.target.value) || 0)) })} />
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={settings.compact} onChange={(event) => update({ compact: event.target.checked })} />
            <span><Boxes aria-hidden="true" /> Compact</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={settings.allowRotate} onChange={(event) => update({ allowRotate: event.target.checked })} />
            <span><RotateCw aria-hidden="true" /> Rotate</span>
          </label>
        </div>
        <button className="ui-button secondary" type="button" disabled={!plan || running || planRunning} onClick={() => void build(true)}>
          <RefreshCw aria-hidden="true" /> Rebuild
        </button>
      </section>

      <section className="plot-selector surface-card">
        <div><span className="surface-eyebrow">Enabled plots</span><h3>Click a plot to include or exclude it.</h3></div>
        <div className="plot-chip-grid">
          {unlocked.map((number) => {
            const on = !disabled.has(number)
            return (
              <button
                type="button"
                key={number}
                className={on ? 'plot-chip active' : 'plot-chip'}
                onClick={() => {
                  const next = new Set(settings.disabledPlots)
                  if (next.has(number)) next.delete(number)
                  else next.add(number)
                  update({ disabledPlots: [...next].sort((x, y) => x - y) })
                }}
              >
                {number}
              </button>
            )
          })}
        </div>
      </section>

      <div className="layout-workspace">
        <section className="layout-canvas-card surface-card">
          <div className="surface-header">
            <div>
              <span className="surface-eyebrow">Physical base</span>
              <h3>{running ? 'Packing structures…' : layout?.feasible ? `${layout.itemCount || layout.placements.length} placed structures` : 'Layout preview'}</h3>
            </div>
            <span className={layout?.feasible ? 'status-badge' : 'status-badge danger'}>
              {layout?.feasible ? 'Feasible' : running ? 'Working' : 'Not ready'}
            </span>
          </div>

          <div className="layout-scroll">
            <div className="layout-board" style={{ aspectRatio: `${boardWidth} / ${boardHeight}` }}>
              {allPlotRects.map((plot: any) => (
                <div
                  key={plot.plot}
                  className={disabled.has(plot.plot) ? 'layout-plot disabled' : 'layout-plot'}
                  style={{
                    left: `${plot.x / boardWidth * 100}%`,
                    top: `${plot.y / boardHeight * 100}%`,
                    width: `${plot.w / boardWidth * 100}%`,
                    height: `${plot.h / boardHeight * 100}%`,
                  }}
                ><span>{plot.plot}</span></div>
              ))}

              {(layout?.fields || []).map((field, index) => (
                <div
                  className={`climate-field ${climateClass(field.type)}`}
                  key={`${field.type}:${index}`}
                  style={{
                    left: `${field.x / boardWidth * 100}%`,
                    top: `${field.y / boardHeight * 100}%`,
                    width: `${field.w / boardWidth * 100}%`,
                    height: `${field.h / boardHeight * 100}%`,
                  }}
                >
                  {field.type === 'cooling'
                    ? <Snowflake aria-hidden="true" />
                    : field.type === 'heating'
                      ? <ThermometerSun aria-hidden="true" />
                      : <SunMedium aria-hidden="true" />}
                </div>
              ))}

              {(layout?.placements || []).map((item) => {
                const facility = DATA.facilities.find((candidate) => candidate.slug === item.facility)
                const icon = assetUrl(facility?.plotGlyph || facility?.icon || item.icon)
                const showLabel = item.w >= 3 && item.h >= 2
                return (
                  <div
                    className={`layout-item kind-${item.kind || 'plan'} env-${String(item.env || 'none').toLowerCase()}`}
                    key={item.id}
                    title={`${item.name}${item.env ? ` · ${item.env}` : ''}`}
                    style={{
                      left: `${item.x / boardWidth * 100}%`,
                      top: `${item.y / boardHeight * 100}%`,
                      width: `${item.w / boardWidth * 100}%`,
                      height: `${item.h / boardHeight * 100}%`,
                    }}
                  >
                    {icon
                      ? <img src={icon} alt="" />
                      : <b className="layout-item-fallback">{item.name.slice(0, 1)}</b>}
                    {showLabel && <span>{item.name}</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {(error || (layout && !layout.feasible)) && (
            <div className="inline-alert danger">{error || layout?.reason}</div>
          )}
        </section>

        <aside className="layout-inspector surface-card">
          <span className="surface-eyebrow">Layout summary</span>
          <div className="inspector-metrics">
            <div><small>Structures</small><b>{layout?.placements.length || 0}</b></div>
            <div><small>Climate fields</small><b>{layout?.fields.length || 0}</b></div>
            <div><small>Plots used</small><b>{layout?.usedPlots?.length || 0}</b></div>
            <div><small>Footprint</small><b>{layout?.bounds ? `${fmt(layout.bounds.w, 1)} × ${fmt(layout.bounds.h, 1)}` : '—'}</b></div>
          </div>
          <div className="legend-list">
            <div><i className="legend-swatch production" /><span>Production</span></div>
            <div><i className="legend-swatch utility" /><span>Utility</span></div>
            <div><i className="legend-swatch storage" /><span>Storage</span></div>
            <div><i className="legend-swatch cooling" /><span>Cooling field</span></div>
            <div><i className="legend-swatch heating" /><span>Heating field</span></div>
            <div><i className="legend-swatch adequate" /><span>Adequate field</span></div>
          </div>
        </aside>
      </div>
    </div>
  )
}
