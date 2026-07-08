// A tiny hash router - no dependency, works from file:// and any static host,
// and keeps every view (and even the atlas *selection*) in the URL so the map
// is deep-linkable and the back button always means "where I just was".

export type Route =
  // '' (the default canvas) renders the Board; `lens=terrain` shows the treemap.
  | { view: 'atlas'; area?: string; module?: string; flow?: string; lens?: 'terrain' }
  | { view: 'capabilities' }
  | { view: 'queue' }
  // `file` selects a box on the module's inner board (23b) - deep-linkable, like
  // the atlas selection, so back always retraces which file you were reading.
  | { view: 'module'; id: string; file?: string }
  | { view: 'concept'; id: string }
  | { view: 'flow'; id: string }
  | { view: 'inferred'; id: string };

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
    const flow = params.get('f') ?? undefined;
    const lens = params.get('lens') === 'terrain' ? ('terrain' as const) : undefined;
    return {
      view: 'atlas',
      ...(area ? { area } : {}),
      ...(module ? { module } : {}),
      ...(flow ? { flow } : {}),
      ...(lens ? { lens } : {}),
    };
  }
  if (path === 'capabilities') return { view: 'capabilities' };
  if (path === 'queue') return { view: 'queue' };

  const [head, ...rest] = path.split('/');
  const id = decodeURIComponent(rest.join('/'));
  if (id.length > 0) {
    if (head === 'module') {
      const file = params.get('file') ?? undefined;
      return { view: 'module', id, ...(file ? { file } : {}) };
    }
    if (head === 'concept') return { view: 'concept', id };
    if (head === 'flow') return { view: 'flow', id };
    if (head === 'inferred') return { view: 'inferred', id };
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
      if (route.flow) params.set('f', route.flow);
      if (route.lens) params.set('lens', route.lens);
      const q = params.toString();
      return q ? `#/?${q}` : '#/';
    }
    case 'capabilities':
      return '#/capabilities';
    case 'queue':
      return '#/queue';
    case 'module': {
      const base = `#/module/${encodeURIComponent(route.id)}`;
      return route.file ? `${base}?file=${encodeURIComponent(route.file)}` : base;
    }
    case 'concept':
    case 'flow':
    case 'inferred':
      return `#/${route.view}/${encodeURIComponent(route.id)}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHref(route);
}
