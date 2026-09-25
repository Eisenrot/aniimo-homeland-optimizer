import type { Facility, Pal } from '../types'

const HIDEOUT = 'https://www.hideoutgacha.com'
const HOME_COIN_ICON = 'https://aniipedia.com/items/v/tl98fh/1010.webp'

const SPECIAL_ITEM_ICONS: Record<string, string> = {
  '110001': `${HIDEOUT}/images/aniimo/database/capture/item_110001.webp`,
  '110002': `${HIDEOUT}/images/aniimo/database/capture/item_110002.webp`,
  '110007': `${HIDEOUT}/images/aniimo/database/capture/item_110007.webp`,
  '150001': `${HIDEOUT}/images/aniimo/database/currency/item_150001.webp`,
  '150002': `${HIDEOUT}/images/aniimo/database/currency/item_150002.webp`,
  '150003': `${HIDEOUT}/images/aniimo/database/currency/item_150003.webp`,
}

const ABILITY_ICONS: Record<string, string> = {
  Fire: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_fire.webp',
  Grass: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_grass.webp',
  Water: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_water.webp',
  Earth: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_earth.webp',
  Lightning: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_electricity.webp',
  Ice: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_ice.webp',
  Wind: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_wind.webp',
  Dark: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_shadow.webp',
  Light: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_light.webp',
  Hauling: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_Img_Ability_Transport.webp',
  Artisanship: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_Img_Ability_Cropping.webp',
  Leisure: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_Img_Ability_Play.webp',
  Perfumery: 'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_Img_Ability_Incense_Making.webp',
}

export function assetUrl(path?: string | null) {
  const value = path || ''
  if (!value) return ''
  return value.startsWith('http') ? value : `${HIDEOUT}${value}`
}

export function facilityAsset(facility?: Pick<Facility, 'icon'> | null) {
  return assetUrl(facility?.icon)
}

export function itemIcon(value: string | number) {
  const id = String(value)
  return id === 'coin'
    ? HOME_COIN_ICON
    : SPECIAL_ITEM_ICONS[id] || `${HIDEOUT}/images/aniimo/database/materials/item_${id}.webp`
}

export function abilityIcon(name: string) {
  return ABILITY_ICONS[name] || ''
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
