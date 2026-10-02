import { ChevronDown, Search } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { itemIcon } from '../lib/presentation'

export type ItemPickerOption = {
  id: string
  name: string
  group?: string
  subgroup?: string
}

type Props = {
  value: string
  options: ItemPickerOption[]
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
      ...(includeCoin ? [{ id: 'coin', name: 'Home Coin' } as ItemPickerOption] : []),
      ...options,
    ],
    [includeCoin, options],
  )

  const current = choices.find((item) => item.id === value) || choices[0]
  const search = query.trim().toLowerCase()
  const visible = choices.filter((item) => item.name.toLowerCase().includes(search))

  const sections = useMemo(() => {
    const out: Array<{
      key: string
      group?: string
      subgroup?: string
      items: ItemPickerOption[]
    }> = []

    for (const item of visible) {
      const last = out[out.length - 1]
      const sameSection = last
        && last.group === item.group
        && last.subgroup === item.subgroup

      if (sameSection) {
        last.items.push(item)
        continue
      }

      out.push({
        key: `${item.group || ''}::${item.subgroup || ''}::${out.length}`,
        group: item.group,
        subgroup: item.subgroup,
        items: [item],
      })
    }

    return out
  }, [visible])

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
              placeholder="Search objectives…"
            />
          </label>

          <div className="item-picker-options">
            {sections.map((section, sectionIndex) => {
              const previous = sections[sectionIndex - 1]
              const showGroup = Boolean(section.group) && section.group !== previous?.group
              const isSpecial = !section.group

              return (
                <Fragment key={section.key}>
                  {showGroup && (
                    <div className="item-picker-group">
                      <span>{section.group}</span>
                    </div>
                  )}
                  {section.subgroup && (
                    <div className="item-picker-subgroup">{section.subgroup}</div>
                  )}
                  {isSpecial && sectionIndex > 0 && <div className="item-picker-special-divider" />}
                  {section.items.map((item) => (
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
                </Fragment>
              )
            })}
            {!visible.length && <div className="item-picker-empty">No matching objective.</div>}
          </div>
        </div>
      )}
    </div>
  )
}