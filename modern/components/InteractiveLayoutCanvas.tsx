import { Crosshair, Minus, Plus } from 'lucide-react'
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

type Bounds = { x: number; y: number; w: number; h: number }

type Props = {
  worldWidth: number
  worldHeight: number
  fitBounds?: Bounds | null
  children: ReactNode
}

const BASE_UNIT = 28
const MIN_SCALE = 0.12
const MAX_SCALE = 7

export default function InteractiveLayoutCanvas({ worldWidth, worldHeight, fitBounds, children }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const scale = useRef(1)
  const homeScale = useRef(1)
  const tx = useRef(0)
  const ty = useRef(0)
  const drag = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{
    distance: number
    scale: number
    tx: number
    ty: number
    center: { x: number; y: number } | null
  }>({ distance: 0, scale: 1, tx: 0, ty: 0, center: null })
  const [zoom, setZoom] = useState(100)
  const [dragging, setDragging] = useState(false)

  const baseW = worldWidth * BASE_UNIT
  const baseH = worldHeight * BASE_UNIT

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

  const apply = useCallback(() => {
    const view = viewport.current
    const target = stage.current
    if (!view || !target) return

    const vw = view.clientWidth
    const vh = view.clientHeight
    const sw = baseW * scale.current
    const sh = baseH * scale.current
    tx.current = sw <= vw ? (vw - sw) / 2 : clamp(tx.current, vw - sw, 0)
    ty.current = sh <= vh ? (vh - sh) / 2 : clamp(ty.current, vh - sh, 0)

    target.style.transform = `translate3d(${tx.current}px,${ty.current}px,0) scale(${scale.current})`
    setZoom(Math.round((scale.current / Math.max(0.0001, homeScale.current)) * 100))
  }, [baseH, baseW])

  const center = useCallback(() => {
    const view = viewport.current
    if (!view) return

    const bounds = fitBounds && fitBounds.w > 0 && fitBounds.h > 0
      ? fitBounds
      : { x: 0, y: 0, w: worldWidth, h: worldHeight }
    const vw = view.clientWidth
    const vh = view.clientHeight
    if (!vw || !vh) return

    const fitW = Math.max(1, bounds.w * BASE_UNIT)
    const fitH = Math.max(1, bounds.h * BASE_UNIT)
    homeScale.current = clamp(Math.min(vw / fitW, vh / fitH) * 0.9, MIN_SCALE, MAX_SCALE)
    scale.current = homeScale.current
    tx.current = (vw - fitW * scale.current) / 2 - bounds.x * BASE_UNIT * scale.current
    ty.current = (vh - fitH * scale.current) / 2 - bounds.y * BASE_UNIT * scale.current
    apply()
  }, [apply, fitBounds, worldHeight, worldWidth])

  const zoomAt = useCallback((clientX: number, clientY: number, direction: number) => {
    const view = viewport.current
    if (!view) return
    const rect = view.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const old = scale.current
    const next = clamp(old * (direction > 0 ? 1.16 : 1 / 1.16), MIN_SCALE, MAX_SCALE)
    if (Math.abs(next - old) < 1e-8) return
    const wx = (px - tx.current) / old
    const wy = (py - ty.current) / old
    scale.current = next
    tx.current = px - wx * next
    ty.current = py - wy * next
    apply()
  }, [apply])

  useEffect(() => {
    const view = viewport.current
    if (!view) return

    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1 : -1)
    }
    view.addEventListener('wheel', wheel, { passive: false })

    const observer = new ResizeObserver(() => center())
    observer.observe(view)
    requestAnimationFrame(center)

    return () => {
      view.removeEventListener('wheel', wheel)
      observer.disconnect()
    }
  }, [center, zoomAt])

  useEffect(() => {
    requestAnimationFrame(center)
  }, [center, fitBounds])

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    viewport.current?.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.current.size === 1) {
      drag.current = {
        active: true,
        x: event.clientX - tx.current,
        y: event.clientY - ty.current,
      }
      setDragging(true)
      return
    }

    if (pointers.current.size === 2) {
      const points = [...pointers.current.values()]
      pinch.current = {
        distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
        scale: scale.current,
        tx: tx.current,
        ty: ty.current,
        center: {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        },
      }
      drag.current.active = false
      setDragging(false)
    }
  }

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.current.size === 2) {
      const points = [...pointers.current.values()]
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      const midpoint = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      }
      const start = pinch.current
      if (start.distance > 0 && start.center) {
        const rect = viewport.current!.getBoundingClientRect()
        const sx = start.center.x - rect.left
        const sy = start.center.y - rect.top
        const mx = midpoint.x - rect.left
        const my = midpoint.y - rect.top
        const next = clamp(start.scale * (distance / start.distance), MIN_SCALE, MAX_SCALE)
        const ratio = next / start.scale
        scale.current = next
        tx.current = mx - (sx - start.tx) * ratio
        ty.current = my - (sy - start.ty) * ratio
        apply()
      }
      return
    }

    if (drag.current.active) {
      tx.current = event.clientX - drag.current.x
      ty.current = event.clientY - drag.current.y
      apply()
    }
  }

  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (!pointers.current.size) {
      drag.current.active = false
      setDragging(false)
    }
  }

  const zoomFromCenter = (direction: number) => {
    const rect = viewport.current?.getBoundingClientRect()
    if (!rect) return
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, direction)
  }

  return (
    <div className="layout-map-shell">
      <div className="layout-map-toolbar">
        <button type="button" onClick={() => zoomFromCenter(-1)} aria-label="Zoom out"><Minus aria-hidden="true" /></button>
        <span className="layout-map-zoom">{zoom}%</span>
        <button type="button" onClick={() => zoomFromCenter(1)} aria-label="Zoom in"><Plus aria-hidden="true" /></button>
        <button className="center" type="button" onClick={center}><Crosshair aria-hidden="true" /> Center</button>
      </div>
      <div
        ref={viewport}
        className={dragging ? 'layout-map-viewport dragging' : 'layout-map-viewport'}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onLostPointerCapture={pointerEnd}
        onDoubleClick={center}
      >
        <div
          ref={stage}
          className="layout-board interactive-stage"
          style={{ width: baseW, height: baseH }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
