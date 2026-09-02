/**
 * A client for scmscx.com's own API — the routes its front end uses. There is no
 * documented or versioned API: the site's About page says those routes are open and
 * unauthenticated and may change without warning, and asks anyone building on them to
 * get in touch. This file mirrors what the front end does (`/api/uiv2/search`, the
 * defaults it leaves out of the query string, `/api/uiv2/map_info`, `/api/maps` for
 * the file itself) and nothing more. One map at a time, when the user picks it.
 *
 * The site sends no CORS headers, so a page served from anywhere else cannot read those
 * routes directly. The client therefore takes a list of *bases* and connects through the
 * first that answers: scmscx.com itself (in case that changes, or the page is served
 * from there), then whatever forwarders the caller adds — scmJS's dev server forwards
 * `/scmscx` to the site. `fetch` is injectable so the tests answer requests themselves.
 * No DOM.
 */

export const SCMSCX = "https://scmscx.com";

/** The sort orders the search route accepts; `relevancy` is the default and is not sent. */
export type Sort =
  | "relevancy"
  | "scenario" | "scenariodesc"
  | "filename" | "filenamedesc"
  | "lastmodifiedold" | "lastmodifiednew"
  | "timeuploadedold" | "timeuploadednew";

export const SORTS: readonly [Sort, string][] = [
  ["relevancy", "Best match"],
  ["timeuploadednew", "Newest upload"],
  ["timeuploadedold", "Oldest upload"],
  ["lastmodifiednew", "Recently modified"],
  ["lastmodifiedold", "Least recently modified"],
  ["scenario", "Scenario name A–Z"],
  ["scenariodesc", "Scenario name Z–A"],
  ["filename", "File name A–Z"],
  ["filenamedesc", "File name Z–A"],
];

/** The tileset filters, in ERA order (the `tileset` number `map_info` reports). */
export const TILESETS = ["badlands", "space_platform", "installation", "ashworld", "jungle", "desert", "ice", "twilight"] as const;
export type TilesetKey = (typeof TILESETS)[number];

export interface SearchQuery {
  /** Words to match; empty lists the whole archive in the sort order. */
  query?: string;
  sort?: Sort;
  /** Rows to skip — the number of rows already fetched, for the next page. */
  offset?: number;
  /** Which text the words are matched against; all on by default. */
  unitNames?: boolean;
  forceNames?: boolean;
  fileNames?: boolean;
  scenarioNames?: boolean;
  scenarioDescriptions?: boolean;
  /** Only these tilesets; empty or missing means all of them. */
  tilesets?: readonly TilesetKey[];
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  minHumans?: number;
  maxHumans?: number;
  minComputers?: number;
  maxComputers?: number;
  uploadedBy?: string;
  includeBroken?: boolean;
  includeOutdated?: boolean;
  includeUnfinished?: boolean;
}

/** One map in a result list. The site lists a map once per file name it knows; those rows are merged here. */
export interface SearchRow {
  id: string;
  /** The scenario name with StarCraft's colour bytes removed; the file name or the id when it is blank. */
  name: string;
  fileNames: string[];
  /** Unix seconds, or null when the site has no file time for it. */
  lastModified: number | null;
  uploaded: number | null;
  url: string;
}

export interface SearchResult {
  rows: SearchRow[];
  /** Rows the search matched in all — per file name, which is what `offset` pages against. */
  total: number;
  /** Raw rows this page held, before merging; add it to `offset` for the next page. */
  fetched: number;
}

export interface Force {
  name: string;
  players: number[];
}

export interface MapInfo {
  id: string;
  name: string;
  description: string;
  chkHash: string;
  mpqHash: string;
  mpqSize: number;
  chkSize: number;
  width: number;
  height: number;
  /** ERA: 0 Badlands … 7 Twilight. */
  tileset: number;
  /** The VER section: 59, 63, 205 or 206. */
  version: number;
  triggers: number;
  briefingTriggers: number;
  units: number;
  locations: number;
  doodads: number;
  sprites: number;
  uniqueTiles: number;
  eudReads: number;
  eudWrites: number;
  eups: number;
  humans: number;
  computers: number;
  forces: Force[];
  /** Every file name the site knows the map under, newest first as the site lists them. */
  fileNames: { name: string; modified: number | null }[];
  uploadedBy: string;
  uploaded: number | null;
  downloads: number;
  views: number;
  url: string;
}

export type ErrorCode = "unreachable" | "network" | "not_found" | "http" | "bad_response";

export interface Attempt {
  base: string;
  reason: string;
}

/** What a failed request becomes. `unreachable` lists what each base answered. */
export class ScmscxError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly attempts: Attempt[];

  constructor(code: ErrorCode, message: string, status = 0, attempts: Attempt[] = []) {
    super(message);
    this.name = "ScmscxError";
    this.code = code;
    this.status = status;
    this.attempts = attempts;
  }

  /** A sentence for the user. */
  get sentence(): string {
    switch (this.code) {
      case "unreachable":
        return "scmscx.com could not be reached from this page.";
      case "network":
        return `scmscx.com did not answer: ${this.message}`;
      case "not_found":
        return "scmscx.com has no such map.";
      case "bad_response":
        return this.message;
      default:
        return `scmscx.com answered ${this.status}.`;
    }
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** Where to send requests, tried in order until one answers; each without a trailing slash. */
  bases: readonly string[];
  fetch?: Fetch;
}

const DEFAULT_MAX_SIZE = 256;
const DEFAULT_MAX_PLAYERS = 12;

/**
 * The search route's path and query string, with every parameter that sits at its default
 * left out — as the site's own front end does, so the URLs match the ones it makes.
 */
export function searchPath(q: SearchQuery): string {
  const p = new URLSearchParams();
  if (q.sort && q.sort !== "relevancy") p.set("sort", q.sort);
  const off = (key: string, on: boolean | undefined) => { if (on === false) p.set(key, "false"); };
  off("unit_names", q.unitNames);
  off("force_names", q.forceNames);
  off("file_names", q.fileNames);
  off("scenario_names", q.scenarioNames);
  off("scenario_descriptions", q.scenarioDescriptions);
  if (q.tilesets && q.tilesets.length > 0) {
    for (const t of TILESETS) if (!q.tilesets.includes(t)) p.set(`tileset_${t}`, "false");
  }
  const num = (key: string, value: number | undefined, dflt: number) => {
    if (value !== undefined && Number.isFinite(value) && value !== dflt) p.set(key, String(Math.trunc(value)));
  };
  num("minimum_map_width", q.minWidth, 0);
  num("maximum_map_width", q.maxWidth, DEFAULT_MAX_SIZE);
  num("minimum_map_height", q.minHeight, 0);
  num("maximum_map_height", q.maxHeight, DEFAULT_MAX_SIZE);
  num("minimum_human_players", q.minHumans, 0);
  num("maximum_human_players", q.maxHumans, DEFAULT_MAX_PLAYERS);
  num("minimum_computer_players", q.minComputers, 0);
  num("maximum_computer_players", q.maxComputers, DEFAULT_MAX_PLAYERS);
  if (q.uploadedBy?.trim()) p.set("uploaded_by", q.uploadedBy.trim());
  if (q.includeBroken) p.set("include_broken", "true");
  if (q.includeOutdated) p.set("include_outdated", "true");
  if (q.includeUnfinished) p.set("include_unfinished", "true");
  if (q.offset && q.offset > 0) p.set("offset", String(Math.trunc(q.offset)));
  const words = q.query?.trim() ?? "";
  const path = words ? `/api/uiv2/search/${encodeURIComponent(words)}` : "/api/uiv2/search";
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

/** The random-map route: the same parameters, answered with one map id. */
export function randomPath(q: SearchQuery): string {
  return searchPath(q).replace(/^\/api\/uiv2\/search/, "/api/uiv2/random");
}

export const mapPageUrl = (id: string) => `${SCMSCX}/map/${encodeURIComponent(id)}`;

/** A minimap PNG, always from the site itself: an `<img>` does not need CORS. */
export const minimapUrl = (id: string) => `${SCMSCX}/api/uiv2/minimap/${encodeURIComponent(id)}`;

const seconds = (v: unknown): number | null => (typeof v === "number" && v > 0 ? v : null);

/** Merge the site's per-file-name rows into one row per map. */
export function mergeRows(raw: RawRow[]): SearchRow[] {
  const byId = new Map<string, SearchRow>();
  for (const r of raw) {
    if (!r || typeof r.id !== "string" || !r.id) continue;
    const fileName = typeof r.filename === "string" && r.filename ? r.filename : null;
    let row = byId.get(r.id);
    if (!row) {
      row = {
        id: r.id,
        name: stripControls(r.scenario_name ?? "") || fileName || r.id,
        fileNames: [],
        lastModified: seconds(r.last_modified),
        uploaded: seconds(r.uploaded_time),
        url: mapPageUrl(r.id),
      };
      byId.set(r.id, row);
    }
    if (fileName && !row.fileNames.includes(fileName)) row.fileNames.push(fileName);
    const t = seconds(r.last_modified);
    if (t !== null && (row.lastModified === null || t > row.lastModified)) row.lastModified = t;
  }
  return [...byId.values()];
}

/** Strip StarCraft's colour and control bytes (below 0x20, other than tab, LF and CR). */
export function stripControls(text: string | null | undefined): string {
  if (!text) return "";
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) out += ch;
  }
  return out.trim();
}

const HUMAN = 6;
const COMPUTER = 5;

export function mapInfoFrom(id: string, raw: RawInfo, names: RawFileName[] | null): MapInfo {
  const meta = raw.meta ?? {};
  const props = raw.properties ?? {};
  const owners = Array.isArray(raw.player_owners) ? raw.player_owners : [];
  const fileNames: MapInfo["fileNames"] = [];
  for (const n of names ?? []) {
    if (n && typeof n.filename === "string" && n.filename) fileNames.push({ name: n.filename, modified: seconds(n.modified_time) });
  }
  return {
    id,
    name: stripControls(raw.scenario ?? ""),
    description: stripControls(raw.scenario_description ?? ""),
    chkHash: meta.chkhash ?? "",
    mpqHash: meta.mpq_hash ?? "",
    mpqSize: meta.mpq_size ?? 0,
    chkSize: meta.chk_size ?? 0,
    width: props.width ?? 0,
    height: props.height ?? 0,
    tileset: props.tileset ?? 0,
    version: props.ver ?? 0,
    triggers: props.triggers ?? 0,
    briefingTriggers: props.briefing_triggers ?? 0,
    units: props.units ?? 0,
    locations: props.locations ?? 0,
    doodads: props.doodads ?? 0,
    sprites: props.sprites ?? 0,
    uniqueTiles: props.unique_terrain_tiles ?? 0,
    eudReads: props.get_death_euds ?? 0,
    eudWrites: props.set_death_euds ?? 0,
    eups: props.eups ?? 0,
    humans: owners.filter((o) => o === HUMAN).length,
    computers: owners.filter((o) => o === COMPUTER).length,
    forces: (raw.forces ?? []).map((f) => ({ name: stripControls(f?.name ?? ""), players: Array.isArray(f?.player_ids) ? f.player_ids : [] })),
    fileNames,
    uploadedBy: meta.uploaded_by ?? "",
    uploaded: seconds(meta.uploaded_time),
    downloads: meta.downloads ?? 0,
    views: meta.views ?? 0,
    url: mapPageUrl(id),
  };
}

export class ScmscxClient {
  readonly bases: readonly string[];
  private active: string | null = null;
  private readonly fetchImpl: Fetch;

  constructor(options: ClientOptions) {
    const seen = new Set<string>();
    this.bases = options.bases.map((b) => b.trim().replace(/\/+$/, "")).filter((b) => b && !seen.has(b) && seen.add(b));
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  /** The base that answered, once one has. */
  get base(): string | null {
    return this.active;
  }

  /**
   * Find a base that answers the search route with JSON — the first in the list that does —
   * and hand back what it answered: the newest uploads. Throws `unreachable` with one
   * reason per base when none does.
   */
  async connect(): Promise<{ base: string; latest: SearchResult }> {
    const attempts: Attempt[] = [];
    for (const base of this.bases) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${base}${searchPath({ sort: "timeuploadednew" })}`, { headers: { accept: "application/json" } });
      } catch (err) {
        attempts.push({ base, reason: err instanceof Error ? err.message : String(err) });
        continue;
      }
      if (!res.ok) {
        attempts.push({ base, reason: `answered ${res.status}` });
        continue;
      }
      let body: unknown;
      try {
        body = JSON.parse(await res.text());
      } catch {
        attempts.push({ base, reason: "answered with something that is not the search API" });
        continue;
      }
      if (!isSearchBody(body)) {
        attempts.push({ base, reason: "answered with something that is not the search API" });
        continue;
      }
      this.active = base;
      return { base, latest: resultFrom(body) };
    }
    throw new ScmscxError("unreachable", attempts.map((a) => `${a.base}: ${a.reason}`).join("; "), 0, attempts);
  }

  async search(q: SearchQuery): Promise<SearchResult> {
    const body = await this.json(searchPath(q));
    if (!isSearchBody(body)) throw new ScmscxError("bad_response", "scmscx.com answered the search with something unexpected.");
    return resultFrom(body);
  }

  /** One random map id among the query's matches. */
  async random(q: SearchQuery): Promise<string> {
    const body = await this.json(randomPath(q));
    if (typeof body !== "string" || !body) throw new ScmscxError("bad_response", "scmscx.com answered the random pick with something unexpected.");
    return body;
  }

  /** A map's details, with the file names the site knows it under (best effort). */
  async mapInfo(id: string): Promise<MapInfo> {
    const raw = (await this.json(`/api/uiv2/map_info/${encodeURIComponent(id)}`)) as RawInfo;
    if (!raw || typeof raw !== "object" || !raw.meta?.mpq_hash) throw new ScmscxError("bad_response", "scmscx.com answered without the map's file hash.");
    let names: RawFileName[] | null = null;
    try {
      const got = await this.json(`/api/uiv2/filenames2/${encodeURIComponent(id)}`);
      names = Array.isArray(got) ? (got as RawFileName[]) : null;
    } catch {
      names = null;
    }
    return mapInfoFrom(id, raw, names);
  }

  /** The map file — the archive as uploaded — by its MPQ hash. */
  async file(mpqHash: string): Promise<Uint8Array> {
    const res = await this.request(`/api/maps/${encodeURIComponent(mpqHash)}`, "application/octet-stream");
    return new Uint8Array(await res.arrayBuffer());
  }

  /* ── plumbing ── */

  private async ensure(): Promise<string> {
    return this.active ?? (await this.connect()).base;
  }

  private async json(path: string): Promise<unknown> {
    const res = await this.request(path, "application/json");
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new ScmscxError("bad_response", `scmscx.com answered ${res.status} with something that is not JSON.`, res.status);
    }
  }

  private async request(path: string, accept: string): Promise<Response> {
    const base = await this.ensure();
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}${path}`, { headers: { accept } });
    } catch (err) {
      throw new ScmscxError("network", err instanceof Error ? err.message : String(err));
    }
    if (res.ok) return res;
    // An unknown id is a 404 on the file route and a 500 from `map_info` (the id fails to parse).
    if (res.status === 404 || (res.status === 500 && path.startsWith("/api/uiv2/map_info/"))) throw new ScmscxError("not_found", `scmscx.com answered ${res.status}.`, res.status);
    throw new ScmscxError("http", `scmscx.com answered ${res.status}.`, res.status);
  }
}

interface SearchBody {
  maps: RawRow[];
  total_results?: number;
}

function isSearchBody(body: unknown): body is SearchBody {
  return !!body && typeof body === "object" && Array.isArray((body as SearchBody).maps);
}

function resultFrom(body: SearchBody): SearchResult {
  return { rows: mergeRows(body.maps), total: typeof body.total_results === "number" ? body.total_results : body.maps.length, fetched: body.maps.length };
}

/* The site's own shapes, as far as this plugin reads them. */

export interface RawRow {
  id?: string;
  scenario_name?: string;
  filename?: string | null;
  last_modified?: number;
  uploaded_time?: number;
}

export interface RawFileName {
  filename?: string;
  modified_time?: number;
}

export interface RawInfo {
  scenario?: string;
  scenario_description?: string;
  player_owners?: number[];
  forces?: { name?: string; player_ids?: number[] }[];
  meta?: {
    chkhash?: string;
    mpq_hash?: string;
    mpq_size?: number;
    chk_size?: number;
    uploaded_by?: string;
    uploaded_time?: number;
    downloads?: number;
    views?: number;
  };
  properties?: {
    width?: number;
    height?: number;
    tileset?: number;
    ver?: number;
    triggers?: number;
    briefing_triggers?: number;
    units?: number;
    locations?: number;
    doodads?: number;
    sprites?: number;
    unique_terrain_tiles?: number;
    get_death_euds?: number;
    set_death_euds?: number;
    eups?: number;
  };
}
