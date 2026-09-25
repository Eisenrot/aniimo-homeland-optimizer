import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { itemIcon } from '../lib/presentation'

type Option = {
  id: string
  name: string
}

type Props = {
  value: string
  options: Option[]
  includeCoin?: boolean
  onChange: (value: string) => void
  ariaLabel?: string
}

export default function ItemPicker({ value, options, includeCoin = false, onChange, ariaLabel }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const choices = useMemo(
    () => [
      ...(includeCoin ? [{ id: 'coin', name: 'Home Coin' }] : []),
      ...options,
    ],
    [includeCoin, options],
  )
  const current = choices.find((item) => item.id === value) || choices[0]
  const visible = choices.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  return (
    <div className="item-picker" ref={root}>
      <button
        className="item-picker-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {current && <img src={itemIcon(current.id)} alt="" />}
        <span>{current?.name || 'Select item'}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      {open && (
        <div className="item-picker-menu">
          <label className="item-picker-search">
            <Search aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search materials…"
            />
          </label>
          <div className="item-picker-options">
            {visible.map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.id === value ? 'item-option selected' : 'item-option'}
                onClick={() => {
                  onChange(item.id)
                  setOpen(false)
                  setQuery('')
                }}
              >
                <img src={itemIcon(item.id)} alt="" />
                <span>{item.name}</span>
              </button>
            ))}
            {!visible.length && <div className="item-picker-empty">No matching material.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
