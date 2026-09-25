export type AppPage =
  | 'overview'
  | 'optimizer'
  | 'homeland'
  | 'team'
  | 'layout'
  | 'roster'

const allowed = new Set<AppPage>([
  'overview',
  'optimizer',
  'homeland',
  'team',
  'layout',
  'roster',
])

export function currentPage(): AppPage {
  const requested = document.body.dataset.page as AppPage | undefined
  return requested && allowed.has(requested) ? requested : 'overview'
}
