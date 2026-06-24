// Thin typed client for the read API (src/serve/api.ts). The dashboard is
// read-only in T15/T16; write-back lands in T17.

export interface MapModule {
  module: string;
  dark: boolean;
  churn: number;
  certifiedFacts: number;
  staleFacts: number;
  score: number;
}

export interface MapArea {
  area: string;
  modules: string[];
  concepts: string[];
  flows: string[];
  dark: boolean;
}

export interface MapFeed {
  areas: MapArea[];
  modules: MapModule[];
  cold: boolean;
}

export async function getMap(): Promise<MapFeed> {
  const res = await fetch('api/map');
  if (!res.ok) throw new Error(`GET /api/map → ${res.status}`);
  return (await res.json()) as MapFeed;
}
