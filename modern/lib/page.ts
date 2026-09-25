export type AppPage = 'plan' | 'team' | 'layout'

const allowed = new Set<AppPage>(['plan', 'team', 'layout'])

export function currentPage(): AppPage {
  const requested = document.body.dataset.page as AppPage | undefined
  return requested && allowed.has(requested) ? requested : 'plan'
}
