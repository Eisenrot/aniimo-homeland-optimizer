import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

const STORAGE_PREFIX = 'aniimoModernPanelCollapsedV1:'

type Props = {
  id: string
  label: string
  children: ReactNode
  defaultCollapsed?: boolean
}

function initialState(id: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback
  try {
    const value = window.localStorage.getItem(STORAGE_PREFIX + id)
    return value == null ? fallback : value === '1'
  } catch {
    return fallback
  }
}

export default function PersistentCollapse({ id, label, children, defaultCollapsed = false }: Props) {
  const [collapsed, setCollapsed] = useState(() => initialState(id, defaultCollapsed))

  const toggle = () => {
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(STORAGE_PREFIX + id, next ? '1' : '0')
      } catch {
        // Storage can be unavailable in hardened/private contexts. The UI still works for this session.
      }
      return next
    })
  }

  return (
    <div className={collapsed ? 'rewrite-collapse is-collapsed' : 'rewrite-collapse'}>
      <div className="rewrite-collapse-body" id={`collapse-${id}`}>
        {children}
      </div>
      <button
        type="button"
        className="rewrite-collapse-toggle"
        aria-controls={`collapse-${id}`}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        onClick={toggle}
      >
        <ChevronDown aria-hidden="true" />
      </button>
    </div>
  )
}
