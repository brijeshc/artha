// A tiny hash router - no dependency, works from file:// and any static host,
// and keeps every view (and even the atlas *selection*) in the URL so the map
// is deep-linkable and the back button always means "where I just was".

export type Route =
  | { view: 'atlas'; area?: string; module?: string }
  | { view: 'capabilities' }
  | { view: 'queue' }
  | { view: 'module'; id: string }
  | { view: 'concept'; id: string }
  | { view: 'flow'; id: string };

export const ATLAS: Route = { view: 'atlas' };

/** `#/module/src%2Fbilling?x` → a typed route. Unknown/malformed → atlas. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  const path = (pathPart ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
  const params = new URLSearchParams(queryPart ?? '');

  if (path === '') {
    const area = params.get('a') ?? undefined;
    const module = params.get('m') ?? undefined;
    return { view: 'atlas', ...(area ? { area } : {}), ...(module ? { module } : {}) };
  }
  if (path === 'capabilities') return { view: 'capabilities' };
  if (path === 'queue') return { view: 'queue' };

  const [head, ...rest] = path.split('/');
  const id = decodeURIComponent(rest.join('/'));
  if (id.length > 0) {
    if (head === 'module') return { view: 'module', id };
    if (head === 'concept') return { view: 'concept', id };
    if (head === 'flow') return { view: 'flow', id };
  }
  return { view: 'atlas' };
}

/** The `href` for a route - always starts `#/` so plain anchors navigate. */
export function routeHref(route: Route): string {
  switch (route.view) {
    case 'atlas': {
      const params = new URLSearchParams();
      if (route.area) params.set('a', route.area);
      if (route.module) params.set('m', route.module);
      const q = params.toString();
      return q ? `#/?${q}` : '#/';
    }
    case 'capabilities':
      return '#/capabilities';
    case 'queue':
      return '#/queue';
    case 'module':
    case 'concept':
    case 'flow':
      return `#/${route.view}/${encodeURIComponent(route.id)}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHref(route);
}
