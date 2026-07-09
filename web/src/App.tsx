import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Catalog as CatalogData,
  type ConceptDetail,
  type FlowDetail,
  type InferredFactView,
  type MapFeed,
  type ModuleBoardData,
  type ModuleDetail,
  type ModuleFact,
  type RankedModule,
  type RefEdge,
  type Suggestion,
  type VouchedPoint,
  certify,
  getCatalog,
  getConcept,
  getDarkZones,
  getFlow,
  getInferred,
  getMap,
  getModule,
  getModuleBoard,
  getRefs,
  getSuggest,
  getVouchedHistory,
  linkPin,
  saveEntry,
} from './api';
import { AtlasViewport } from './components/Atlas';
import { BoardViewport } from './components/Board';
import { ConceptPage, FlowPage } from './components/CapabilityPages';
import { CatalogPage } from './components/CatalogPage';
import { CommandBar } from './components/CommandBar';
import type { Curation } from './components/Curate';
import { InferredPage } from './components/Inferred';
import { Inspector } from './components/Inspector';
import { ModulePage } from './components/ModulePage';
import { Navigator } from './components/Navigator';
import { Observatory } from './components/Observatory';
import { QueuePage } from './components/QueuePage';
import { type Crumb, TopBar } from './components/TopBar';
import { MISC, NAV, WORDMARK } from './copy';
import {
  type CapabilityEntry,
  areaStats,
  capabilitiesByArea,
  capabilityEntries,
  capabilityNames,
  flowTrace,
  kpis,
  neighborsOf,
} from './derive';
import { type Route, navigate, parseRoute, routeHref } from './router';

/**
 * The shell: a full-screen instrument - top bar, navigator, canvas, inspector -
 * over the read API. Every view and even the atlas *selection* lives in the
 * URL hash, so the whole knowledge base deep-links and the back button always
 * retraces your path. Read-only and offline; write-back (T17) and the ask loop
 * (T18) hook into the same routes.
 */
export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? { view: 'atlas' } : parseRoute(window.location.hash),
  );
  const [map, setMap] = useState<MapFeed | null>(null);
  const [zones, setZones] = useState<RankedModule[]>([]);
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [refs, setRefs] = useState<RefEdge[]>([]);
  const [history, setHistory] = useState<VouchedPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  // Fullscreen focus (any view): the chrome folds away and, where the browser
  // allows it, the window goes truly fullscreen. Transient - never in the URL.
  const [focus, setFocus] = useState(false);

  // Per-id detail caches - a local server answers in ~1ms, but caching keeps
  // back/forward instant and avoids refetch loops on selection changes.
  const [moduleDetails, setModuleDetails] = useState<Map<string, ModuleDetail | null>>(new Map());
  const [moduleBoards, setModuleBoards] = useState<Map<string, ModuleBoardData | null>>(new Map());
  const [conceptDetail, setConceptDetail] = useState<ConceptDetail | null>(null);
  const [flowDetail, setFlowDetail] = useState<FlowDetail | null>(null);
  // The flow being traced as a route on the atlas (`#/?f=…`) - cached apart
  // from the flow *page* detail so the two never contend.
  const [traceDetail, setTraceDetail] = useState<FlowDetail | null>(null);
  const [inferredDetail, setInferredDetail] = useState<InferredFactView | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    getMap()
      .then(setMap)
      .catch((e: unknown) => setError(errMsg(e)));
    getDarkZones()
      .then(setZones)
      .catch(() => setZones([]));
    getCatalog()
      .then(setCatalog)
      .catch(() => setCatalog({ concepts: [], flows: [] }));
    // The reference graph is code-structural - immutable under curation - so it's
    // read once and reused for the atlas's neighbour outlines.
    getRefs()
      .then(setRefs)
      .catch(() => setRefs([]));
    // The vouched burn-up's raw series (23c) - certified facts by date.
    getVouchedHistory()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  const toggleFocus = useCallback(() => {
    setFocus((f) => {
      const next = !f;
      // Best effort - denied/unsupported native fullscreen still folds the chrome.
      try {
        if (next) document.documentElement.requestFullscreen?.()?.catch(() => {});
        else if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
      } catch {
        /* the chrome fold alone is still a focus mode */
      }
      return next;
    });
  }, []);

  // Leaving native fullscreen (browser Esc, F11, system UI) unfolds the chrome
  // too - the two never drift apart.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFocus(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ⌘K / Ctrl-K toggles the command bar; `f` toggles fullscreen focus; Esc
  // closes the bar, else leaves focus, else clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t !== null && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      } else if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
        e.preventDefault();
        toggleFocus();
      } else if (e.key === 'Escape') {
        setCmdkOpen((open) => {
          if (open) return false;
          setFocus((f) => {
            if (f) {
              try {
                if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
              } catch {
                /* nothing to leave */
              }
              return false;
            }
            const r = parseRoute(window.location.hash);
            // Esc clears what you are looking *at* (selection, traced flow)
            // but keeps how you are looking (the lens is a mode, not a focus).
            if (r.view === 'atlas' && (r.area || r.module || r.flow))
              navigate({ view: 'atlas', ...(r.lens ? { lens: r.lens } : {}) });
            // On a module page, Esc lets go of the selected inner-board file.
            else if (r.view === 'module' && r.file) navigate({ view: 'module', id: r.id });
            return f;
          });
          return false;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFocus]);

  // The module the UI is inspecting (atlas selection) or reading (module page).
  const neededModule =
    route.view === 'module' ? route.id : route.view === 'atlas' ? (route.module ?? null) : null;

  useEffect(() => {
    if (!neededModule || moduleDetails.has(neededModule)) return;
    getModule(neededModule)
      .then((d) => setModuleDetails((prev) => new Map(prev).set(neededModule, d)))
      .catch(() => setModuleDetails((prev) => new Map(prev).set(neededModule, null)));
  }, [neededModule, moduleDetails]);

  // The inner board (23b) is the module *page's* hero; an atlas selection only
  // needs the lighter detail, so fetch it just for the full module view.
  const boardModule = route.view === 'module' ? route.id : null;
  useEffect(() => {
    if (!boardModule || moduleBoards.has(boardModule)) return;
    getModuleBoard(boardModule)
      .then((b) => setModuleBoards((prev) => new Map(prev).set(boardModule, b)))
      .catch(() => setModuleBoards((prev) => new Map(prev).set(boardModule, null)));
  }, [boardModule, moduleBoards]);

  const capabilityRoute =
    route.view === 'concept' || route.view === 'flow' ? { kind: route.view, id: route.id } : null;
  const capabilityKey = capabilityRoute ? `${capabilityRoute.kind}:${capabilityRoute.id}` : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: capabilityKey is the identity of capabilityRoute
  useEffect(() => {
    setDetailError(null);
    setSuggestions([]);
    if (!capabilityRoute) return;
    if (capabilityRoute.kind === 'concept') {
      setConceptDetail(null);
      getConcept(capabilityRoute.id)
        .then(setConceptDetail)
        .catch((e: unknown) => setDetailError(errMsg(e)));
    } else {
      setFlowDetail(null);
      getFlow(capabilityRoute.id)
        .then(setFlowDetail)
        .catch((e: unknown) => setDetailError(errMsg(e)));
    }
    // Machine-proposed pins for this capability (T17b) - ranked, each with a why.
    getSuggest(capabilityRoute.id)
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }, [capabilityKey]);

  // The flow behind an atlas route trace (`#/?f=…`).
  const tracedFlowId = route.view === 'atlas' ? (route.flow ?? null) : null;
  useEffect(() => {
    if (!tracedFlowId) return;
    getFlow(tracedFlowId)
      .then(setTraceDetail)
      .catch(() => setTraceDetail(null));
  }, [tracedFlowId]);

  // The machine-described (moonlight) detail - a module card or state-machine
  // candidate. Loaded on its own so it never contends with the concept/flow cache.
  const inferredId = route.view === 'inferred' ? route.id : null;
  useEffect(() => {
    if (!inferredId) return;
    setInferredDetail(null);
    setDetailError(null);
    getInferred(inferredId)
      .then(setInferredDetail)
      .catch((e: unknown) => setDetailError(errMsg(e)));
  }, [inferredId]);

  const onGo = useCallback((r: Route) => {
    setCmdkOpen(false);
    navigate(r);
  }, []);

  // After a curation write the index is rebuilt server-side; re-read every feed
  // (and the open capability detail, whose route key hasn't changed) so the map
  // redraws and the just-certified item glows without a reload.
  const refresh = useCallback(async () => {
    const [m, c, z, h] = await Promise.allSettled([
      getMap(),
      getCatalog(),
      getDarkZones(),
      getVouchedHistory(),
    ]);
    if (m.status === 'fulfilled') setMap(m.value);
    if (c.status === 'fulfilled') setCatalog(c.value);
    if (z.status === 'fulfilled') setZones(z.value);
    if (h.status === 'fulfilled') setHistory(h.value);
    setModuleDetails(new Map());
    setModuleBoards(new Map());
    const r = parseRoute(window.location.hash);
    if (r.view === 'concept') setConceptDetail(await getConcept(r.id).catch(() => null));
    if (r.view === 'flow') setFlowDetail(await getFlow(r.id).catch(() => null));
    // A confirmed suggestion is now a pin - re-rank so it drops off the list.
    if (r.view === 'concept' || r.view === 'flow') {
      setSuggestions(await getSuggest(r.id).catch(() => []));
    }
  }, []);

  const curation = useMemo<Curation>(
    () => ({
      certify: async (id) => {
        const res = await certify(id);
        // Vouching an inferred (moonlight) fact materializes it into a real
        // entry (23d-2); the inferred page is now suppressed, so land on the
        // freshly-vouched human page - which glows phosphor.
        landAfterMaterialize(id, res.id);
        await refresh();
      },
      link: async (id, symbol) => {
        await linkPin(id, symbol);
        await refresh();
      },
      edit: async (patch) => {
        const res = await saveEntry(patch);
        landAfterMaterialize(patch.id, res.id);
        await refresh();
      },
    }),
    [refresh],
  );

  const names = useMemo(
    () => (catalog ? capabilityNames(catalog) : new Map<string, string>()),
    [catalog],
  );
  const entries = useMemo(() => (catalog ? capabilityEntries(catalog) : []), [catalog]);
  const entryById = useMemo(() => new Map(entries.map((e) => [e.ref.id, e])), [entries]);
  const capabilityOf = useCallback(
    (fact: ModuleFact): CapabilityEntry | null => entryById.get(fact.id) ?? null,
    [entryById],
  );

  if (error) {
    return (
      <div className="boot">
        <p className="wordmark">{WORDMARK}</p>
        <p className="boot-error">Could not read the index: {error}</p>
        <p className="boot-hint mono">artha build && artha serve</p>
      </div>
    );
  }
  if (!map || !catalog) {
    return (
      <div className="boot">
        <p className="wordmark">{WORDMARK}</p>
        <p className="boot-loading">{MISC.loading}</p>
      </div>
    );
  }

  const stats = areaStats(map);
  const selectedArea = route.view === 'atlas' ? (route.area ?? null) : null;
  const selectedModule = route.view === 'atlas' ? (route.module ?? null) : null;
  const atlasLens = route.view === 'atlas' ? route.lens : undefined;
  // Only trace once the loaded flow matches the URL - never draw a stale route.
  const trace =
    route.view === 'atlas' && route.flow && traceDetail && traceDetail.id === route.flow
      ? flowTrace(
          traceDetail,
          map.modules.map((m) => m.module),
        )
      : null;

  const inspector = (() => {
    if (route.view !== 'atlas') return null;
    if (selectedModule) {
      return (
        <Inspector
          content={{
            kind: 'module',
            module: selectedModule,
            mapModule: map.modules.find((m) => m.module === selectedModule) ?? null,
            detail: moduleDetails.get(selectedModule) ?? null,
          }}
        />
      );
    }
    if (selectedArea) {
      const stat = stats.find((s) => s.area.area === selectedArea);
      if (!stat) return null;
      const group = capabilitiesByArea(catalog, map.areas).find(
        (g) => g.area?.area === selectedArea,
      );
      return <Inspector content={{ kind: 'area', stat, entries: group?.entries ?? [] }} />;
    }
    return null;
  })();

  const canvas = (() => {
    switch (route.view) {
      case 'atlas':
        // The Board is the default canvas (23a′ pivot); the treemap Terrain
        // stays one nav item away for the churn/coverage reading.
        if (atlasLens === 'terrain')
          return (
            <AtlasViewport
              feed={map}
              selectedArea={selectedArea}
              selectedModule={selectedModule}
              zones={zones}
              neighbors={neighborsOf(refs, selectedModule)}
            />
          );
        return (
          <BoardViewport
            feed={map}
            refs={refs}
            catalog={catalog}
            selectedArea={selectedArea}
            selectedModule={selectedModule}
            trace={trace}
          />
        );
      case 'capabilities':
        return <CatalogPage catalog={catalog} feed={map} />;
      case 'observatory':
        return <Observatory feed={map} history={history} />;
      case 'queue':
        return <QueuePage zones={zones} cold={map.cold} />;
      case 'module': {
        const detail = moduleDetails.get(route.id);
        if (detail === null) return <NotFound label={route.id} />;
        if (!detail) return <Loading />;
        return (
          <ModulePage
            detail={detail}
            board={moduleBoards.get(route.id) ?? null}
            selectedFile={route.file ?? null}
            capabilityOf={capabilityOf}
            curation={curation}
          />
        );
      }
      case 'concept':
        if (detailError) return <NotFound label={route.id} note={detailError} />;
        if (!conceptDetail) return <Loading />;
        return (
          <ConceptPage
            detail={conceptDetail}
            names={names}
            curation={curation}
            suggestions={suggestions}
          />
        );
      case 'flow':
        if (detailError) return <NotFound label={route.id} note={detailError} />;
        if (!flowDetail) return <Loading />;
        return (
          <FlowPage
            detail={flowDetail}
            names={names}
            curation={curation}
            suggestions={suggestions}
          />
        );
      case 'inferred':
        if (detailError) return <NotFound label={route.id} note={detailError} />;
        if (!inferredDetail) return <Loading />;
        return <InferredPage detail={inferredDetail} curation={curation} />;
    }
  })();

  return (
    <div className={focus ? 'shell focus' : 'shell'}>
      <TopBar
        crumbs={crumbs(route, names, route.view === 'inferred' ? inferredDetail?.name : undefined)}
        kpis={kpis(map)}
        onOpenCmdk={() => setCmdkOpen(true)}
        focus={focus}
        onToggleFocus={toggleFocus}
      />
      <div className="shell-body">
        <Navigator
          route={route}
          feed={map}
          catalog={catalog}
          stats={stats}
          zoneCount={darkCount(map)}
        />
        <main className={inspector ? 'canvas with-inspector' : 'canvas'}>{canvas}</main>
        {inspector}
      </div>
      <CommandBar open={cmdkOpen} feed={map} onClose={() => setCmdkOpen(false)} onGo={onGo} />
    </div>
  );
}

function crumbs(route: Route, names: Map<string, string>, inferredName?: string | null): Crumb[] {
  switch (route.view) {
    case 'atlas': {
      const terrain = route.lens === 'terrain';
      const home = terrain ? '#/?lens=terrain' : '#/';
      const out: Crumb[] = [
        {
          label: terrain ? NAV.terrain : NAV.board,
          href: route.area || route.module || route.flow ? home : undefined,
        },
      ];
      if (route.area) out.push({ label: route.area });
      if (route.module) out.push({ label: route.module, mono: true });
      if (route.flow) out.push({ label: names.get(route.flow) ?? route.flow });
      return out;
    }
    case 'capabilities':
      return [{ label: NAV.capabilities }];
    case 'observatory':
      return [{ label: NAV.observatory }];
    case 'queue':
      return [{ label: NAV.queue }];
    case 'module':
      return [
        { label: NAV.board, href: '#/' },
        { label: route.id, mono: true },
      ];
    case 'concept':
    case 'flow':
      return [
        { label: NAV.capabilities, href: '#/capabilities' },
        { label: names.get(route.id) ?? route.id },
      ];
    case 'inferred':
      return [
        { label: NAV.capabilities, href: '#/capabilities' },
        // Concepts/flows resolve from the catalog; a convention (not a catalog
        // capability) falls back to the loaded fact's own heading (e.g. `*Repo`).
        { label: names.get(route.id) ?? inferredName ?? route.id },
      ];
  }
}

function darkCount(map: MapFeed): number {
  return map.modules.filter((m) => m.dark && m.churn > 0).length;
}

/** After a write, if the source id was an inferred (moonlight) fact, the write
 * materialized it into a new human entry (`newId`, e.g. `concept.…`); navigate to
 * that page since the inferred route no longer resolves. A plain human edit
 * (`sourceId` unchanged) stays put. */
function landAfterMaterialize(sourceId: string, newId: string): void {
  if (!sourceId.startsWith('inferred:')) return;
  const view = newId.split('.')[0];
  if (view === 'concept' || view === 'flow') navigate({ view, id: newId });
}

function Loading(): JSX.Element {
  return (
    <div className="page">
      <p className="boot-loading">{MISC.loading}</p>
    </div>
  );
}

function NotFound({ label, note }: { label: string; note?: string }): JSX.Element {
  return (
    <div className="page">
      <p className="empty-note">
        {MISC.notFound} <span className="mono">{label}</span>
        {note ? ` - ${note}` : ''}
      </p>
      <p>
        <a className="inspector-cta" href="#/">
          ← {MISC.backToAtlas}
        </a>
      </p>
    </div>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
