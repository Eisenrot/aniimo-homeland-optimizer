import type { Facility, Pal } from '../types'

const HIDEOUT = 'https://www.hideoutgacha.com'

export function assetUrl(path?: string | null) {
  const value = path || ''
  if (!value) return ''
  return value.startsWith('http') ? value : `${HIDEOUT}${value}`
}

export function facilityAsset(facility?: Pick<Facility, 'icon'> | null) {
  return assetUrl(facility?.icon)
}

export function palHeadKey(pal: Pal) {
  const id = String(pal.id ?? '')
  return pal.isForm ? id : id.slice(0, -2)
}

export function palHeadUrl(pal: Pal) {
  return `https://aniidex.com/images/aniimo/UI_PetHead_${palHeadKey(pal)}.webp`
}

export function fmt(value: number, digits = 1) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  })
}
