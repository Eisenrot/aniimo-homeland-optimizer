import { useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, RefreshCw, RotateCw } from 'lucide-react'
import {
  LAYOUT_SETTINGS_STORE,
  PLOT_MATRIX,
  plotRect,
  readFullLayoutCache,
  unlockedPlotNumbers,
  writeFullLayoutCache,
} from '../../src/full-layout.js'
import InteractiveLayoutCanvas from '../components/InteractiveLayoutCanvas'
import PlotSelector from '../components/PlotSelector'
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
  storageUnits: 0,
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

function rectBounds(rects: Array<{ x: number; y: number; w: number; h: number }>) {
  if (!rects.length) return null
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h))
  return { x, y, w: right - x, h: bottom - y }
}

function climateTemperature(type: string, plan: OptimizerPlan | null, explicit?: string | null) {
  if (explicit) return String(explicit)
  if (type === 'cooling') return String(plan?.scenario?.cooling || 'Cool')
  if (type === 'heating') return String(plan?.scenario?.heat || 'Warm')
  return 'Adequate'
}

function climateClass(type: string, plan: OptimizerPlan | null, explicit?: string | null) {
  return climateTemperature(type, plan, explicit).toLowerCase().replace(/[^a-z]+/g, '-')
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
  const disabled = useMemo(() => new Set(settings.disabledPlots), [settings.disabledPlots])
  const allPlotRects = useMemo(
    () => unlocked.map((number) => plotRect(number)).filter(Boolean) as Array<{ plot: number; x: number; y: number; w: number; h: number }>,
    [unlocked],
  )
  const enabledRects = useMemo(() => allPlotRects.filter((plot) => !disabled.has(plot.plot)), [allPlotRects, disabled])
  const boardWidth = PLOT_MATRIX[0].length * 20
  const boardHeight = PLOT_MATRIX.length * 15

  const fitBounds = useMemo(() => {
    const source = layout?.feasible && layout.bounds ? [layout.bounds, ...(layout.fields || [])] : enabledRects
    const bounds = rectBounds(source)
    if (!bounds) return { x: 0, y: 0, w: boardWidth, h: boardHeight }
    const pad = 2.5
    const x = Math.max(0, bounds.x - pad)
    const y = Math.max(0, bounds.y - pad)
    const right = Math.min(boardWidth, bounds.x + bounds.w + pad)
    const bottom = Math.min(boardHeight, bounds.y + bounds.h + pad)
    return { x, y, w: right - x, h: bottom - y }
  }, [layout, enabledRects, boardWidth, boardHeight])

  return (
    <div className="layout-stage">
      <section className="layout-canvas-stage">
        <div className="layout-floating-title">
          <span>PHYSICAL HOMELAND / LIVE BOARD</span>
          <h1>{running ? 'Arranging…' : layout?.feasible ? 'Placement found.' : 'Build the floor.'}</h1>
          <small>drag · wheel to zoom · double-click to center</small>
        </div>

        <div className="layout-floating-controls">
          <label>
            <span>STYLE</span>
            <select value={settings.shape} onChange={(event) => update({ shape: event.target.value as LayoutSettings['shape'] })}>
              <option value="auto">Auto</option>
              <option value="compact">Compact</option>
              <option value="clusters">Clusters</option>
              <option value="rows">Rows</option>
              <option value="spread">Spread</option>
            </select>
          </label>
          <label>
            <span>STORAGE</span>
            <input
              type="number"
              min={0}
              max={24}
              value={settings.storageUnits}
              onChange={(event) => update({ storageUnits: Math.max(0, Math.min(24, Number(event.target.value) || 0)) })}
            />
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={settings.compact} onChange={(event) => update({ compact: event.target.checked })} />
            <span><Boxes aria-hidden="true" /> Compact</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={settings.allowRotate} onChange={(event) => update({ allowRotate: event.target.checked })} />
            <span><RotateCw aria-hidden="true" /> Rotate</span>
          </label>
          <PlotSelector
            unlocked={unlocked}
            disabled={settings.disabledPlots}
            used={layout?.usedPlots || []}
            onApply={(disabledPlots) => update({ disabledPlots })}
          />
          <button className="ui-button secondary" type="button" disabled={!plan || running || planRunning} onClick={() => void build(true)}>
            <RefreshCw aria-hidden="true" /> Rebuild
          </button>
        </div>

        <InteractiveLayoutCanvas worldWidth={boardWidth} worldHeight={boardHeight} fitBounds={fitBounds}>
          {allPlotRects.map((plot) => (
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

          {(layout?.fields || []).filter((field) => !field.type.startsWith('power-')).map((field, index) => {
            const temperature = climateTemperature(field.type, plan, field.temperature)
            const tone = climateClass(field.type, plan, field.temperature)
            return (
              <div
                className={`climate-zone-hatch tone-${tone}`}
                key={`climate-hatch:${field.type}:${index}`}
                aria-hidden="true"
                title={temperature}
                style={{
                  left: `${field.x / boardWidth * 100}%`,
                  top: `${field.y / boardHeight * 100}%`,
                  width: `${field.w / boardWidth * 100}%`,
                  height: `${field.h / boardHeight * 100}%`,
                }}
              >
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
                  <line x1="-34" y1="100" x2="66" y2="0" />
                  <line x1="0" y1="100" x2="100" y2="0" />
                  <line x1="34" y1="100" x2="134" y2="0" />
                </svg>
              </div>
            )
          })}

          {(layout?.fields || []).filter((field) => field.type.startsWith('power-')).map((field, index) => (
            <div
              className={`power-zone-hatch ${field.type === 'power-generator' ? 'generator' : 'pole'}`}
              key={`power-hatch:${field.type}:${index}`}
              aria-hidden="true"
              title={field.type === 'power-generator' ? 'Crackle Generator · 11×11' : 'Crackle Power Pole · 7×7'}
              style={{
                left: `${field.x / boardWidth * 100}%`,
                top: `${field.y / boardHeight * 100}%`,
                width: `${field.w / boardWidth * 100}%`,
                height: `${field.h / boardHeight * 100}%`,
              }}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
                <line x1="-10" y1="100" x2="90" y2="0" />
                <line x1="25" y1="100" x2="125" y2="0" />
              </svg>
            </div>
          ))}

          {(layout?.placements || []).map((item) => {
            const facility = DATA.facilities.find((candidate) => candidate.slug === item.facility)
            const icon = assetUrl(facility?.plotGlyph || facility?.icon || item.icon)
            const compactLabel = item.w < 3 || item.h < 2
            const electrical = Boolean(
              item.electric
              || item.facility === 'crackle-generator'
              || item.facility === 'crackle-power-pole'
            )
            return (
              <div
                className={`layout-item kind-${item.kind || 'plan'} env-${String(item.env || 'none').toLowerCase()} ${electrical ? 'is-electrical' : ''}`}
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
                  ? <img src={icon} alt="" draggable={false} />
                  : <b className="layout-item-fallback">{item.name.slice(0, 1)}</b>}
                <span className={compactLabel ? 'layout-item-name compact' : 'layout-item-name'}>{item.name}</span>
              </div>
            )
          })}

          {(layout?.fields || []).filter((field) => !field.type.startsWith('power-')).map((field, index) => {
            const temperature = climateTemperature(field.type, plan, field.temperature)
            const tone = climateClass(field.type, plan, field.temperature)
            return (
              <div
                className={`climate-zone-outline tone-${tone}`}
                key={`climate-outline:${field.type}:${index}`}
                aria-hidden="true"
                title={temperature}
                style={{
                  left: `${field.x / boardWidth * 100}%`,
                  top: `${field.y / boardHeight * 100}%`,
                  width: `${field.w / boardWidth * 100}%`,
                  height: `${field.h / boardHeight * 100}%`,
                }}
              />
            )
          })}

          {(layout?.fields || []).filter((field) => field.type.startsWith('power-')).map((field, index) => (
            <div
              className={`power-zone-outline ${field.type === 'power-generator' ? 'generator' : 'pole'}`}
              key={`power-outline:${field.type}:${index}`}
              aria-hidden="true"
              style={{
                left: `${field.x / boardWidth * 100}%`,
                top: `${field.y / boardHeight * 100}%`,
                width: `${field.w / boardWidth * 100}%`,
                height: `${field.h / boardHeight * 100}%`,
              }}
            />
          ))}
        </InteractiveLayoutCanvas>

        <aside className="layout-floating-inspector">
          <span>{running ? 'PACKING' : layout?.feasible ? 'PLACED' : 'NOT READY'}</span>
          <strong>{layout?.placements.length || 0}</strong>
          <small>structures</small>
          <div>
            <b>{layout?.usedPlots?.length || 0}/{enabledRects.length}<small>plots</small></b>
            <b>{enabledRects.length}<small>available</small></b>
            <b>{layout?.bounds ? `${fmt(layout.bounds.w, 1)}×${fmt(layout.bounds.h, 1)}` : '—'}<small>footprint</small></b>
          </div>
        </aside>

        <div className="layout-floating-legend">
          <span><i className="legend-swatch freeze" />Freeze</span>
          <span><i className="legend-swatch cool" />Cool</span>
          <span><i className="legend-swatch sunlamp" />Sunlamp</span>
          <span><i className="legend-swatch warm" />Warm</span>
          <span><i className="legend-swatch scorching" />Scorching</span>
          <span><i className="legend-swatch electrical" />Electrical</span>
          <span><i className="legend-swatch storage" />Storage</span>
        </div>

        {(error || (layout && !layout.feasible)) && (
          <div className="layout-floating-error">{error || layout?.reason}</div>
        )}
      </section>
    </div>
  )
}