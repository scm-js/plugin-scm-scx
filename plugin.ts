/**
 * scmscx.com — a plugin for the scmJS map editor (https://github.com/jeany55/scm-js).
 *
 * scmscx.com is an archive of StarCraft maps with a search over their names, file names,
 * descriptions, unit and force names. This plugin puts that search in the editor:
 *
 * - File ▸ Find on scmscx.com… (under Open Recent): search the archive, filter by sort
 *   order, tileset, players and size, read a map's details with its minimap, and open
 *   it in the editor. A pasted map address (`https://scmscx.com/map/…`) opens that map's
 *   details straight away; Random picks one of the matches.
 * - Plugins ▸ scmscx.com Settings…: the forwarder address, for when the page cannot
 *   read the site directly.
 *
 * The site's API sends no CORS headers, so a browser lets only pages served from
 * scmscx.com read its answers. The plugin asks the site first every time — so it needs
 * nothing extra the day the site allows it, and nothing at all from an editor served
 * there — and otherwise goes through a *forwarder*, a worker that passes each request
 * on to the site and adds the header. `DEFAULT_FORWARDER` below is the one that ships
 * (source at https://github.com/scm-js/cloudflare-scm-scx-forwarder), so an editor
 * served from anywhere else sends its searches through that host; Settings replaces it
 * or empties it. Nothing else is ever contacted. Both menu items carry the plugin's
 * mark, since they reach the network.
 *
 * `client.ts` is the typed client for the site's routes, `format.ts` the labels. This
 * file is the dialogs: plain DOM with a small `h()` builder and a scoped stylesheet, as
 * the other scm-js plugins do. `plugin-api/` is the editor's emitted type declarations,
 * vendored so the repository type-checks alone; the host erases the type-only import.
 */
import type { DialogHandle, PluginApi } from "./plugin-api/plugins/api";
import { minimapUrl, ScmscxClient, ScmscxError, SCMSCX, SORTS, TILESETS, type MapInfo, type SearchQuery, type SearchRow, type Sort, type TilesetKey } from "./client";
import { downloadName, eudLabel, formatDate, formatSize, normalizeAddress, objectsLabel, parseMapRef, playersLabel, TILESET_NAMES, tilesetName, triggersLabel, versionName } from "./format";

/* ── DOM helpers ────────────────────────────────────────── */

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "className") el.className = String(v);
      else if (k === "style") el.setAttribute("style", String(v));
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}

function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const link = (href: string, text: string) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);

const STYLE = `
.sx { display: flex; flex-direction: column; gap: 10px; font-size: 12px; min-height: 0; flex: 1; }
.sx .sx-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sx .sx-row.wrap { flex-wrap: wrap; }
.sx .sx-row > label:first-child { min-width: 92px; color: var(--text-dim, #99a2b3); }
.sx .sx-grow { flex: 1; min-width: 0; }
.sx .sx-dim { color: var(--text-dim, #99a2b3); }
.sx .sx-faint { color: var(--text-faint, #6b7382); }
.sx .sx-sec { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--border, #333); border-radius: 4px; background: var(--bg-1, #14171d); }
.sx .sx-sec > header { display: flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--text-dim, #99a2b3); }
.sx .sx-status { min-height: 16px; color: var(--text-dim, #99a2b3); }
.sx .sx-status.error { color: #ffb3b0; }
.sx .sx-status.ok { color: var(--ok, #5cb85c); }
.sx .btn.sm { height: 22px; padding: 0 8px; font-size: 11px; min-width: 0; }
.sx .sx-num { width: 58px; }
.sx .sx-find { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; min-height: 0; flex: 1; }
.sx .sx-results { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.sx .sx-list { flex: 1; min-height: 160px; overflow: auto; border: 1px solid var(--border, #333); background: var(--bg-0, #111); padding: 3px; display: flex; flex-direction: column; gap: 2px; }
.sx .sx-item { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 8px; align-items: center; padding: 4px 6px; border-radius: 3px; cursor: pointer; }
.sx .sx-item:hover { background: var(--bg-2, #1b1f27); }
.sx .sx-item.on { background: var(--sel, #2b4f80); color: #fff; }
.sx .sx-item.on .sx-dim, .sx .sx-item.on .sx-faint { color: rgba(255,255,255,.75); }
.sx .sx-thumb { width: 44px; height: 44px; display: grid; place-items: center; background: var(--bg-1, #14171d); border: 1px solid var(--border, #333); border-radius: 3px; overflow: hidden; }
.sx .sx-thumb img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
.sx .sx-thumb.none { color: var(--text-faint, #6b7382); font-size: 10px; }
.sx .sx-item-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sx .sx-item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sx .sx-item-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sx .sx-details { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow: auto; padding: 8px; border: 1px solid var(--border, #333); border-radius: 4px; background: var(--bg-1, #14171d); }
.sx .sx-details h3 { margin: 0; font-size: 13px; }
.sx .sx-details p { margin: 0; white-space: pre-wrap; word-break: break-word; }
.sx .sx-details .sx-big { width: 100%; max-height: 200px; object-fit: contain; image-rendering: pixelated; background: var(--bg-0, #0a0c10); border: 1px solid var(--border, #333); }
.sx .sx-kv { display: grid; grid-template-columns: 76px 1fr; gap: 2px 8px; }
.sx .sx-kv > span:nth-child(odd) { color: var(--text-dim, #99a2b3); }
.sx .sx-kv > span:nth-child(even) { word-break: break-word; }
.sx a { color: var(--teal, #4fd1c5); }
.sx .sx-check { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.sx .sx-attempts { margin: 0; padding-left: 16px; }
`;

/* ── Settings ───────────────────────────────────────────── */

interface Settings {
  /** An address that forwards requests to scmscx.com, tried after the site itself. Blank for none. */
  forwarder: string;
  lastQuery: string;
  sort: Sort;
}

/**
 * The forwarder everyone gets: https://github.com/scm-js/cloudflare-scm-scx-forwarder,
 * deployed. It is only reached when scmscx.com itself does not answer, which today means
 * any editor not served from scmscx.com. Settings replaces it with your own.
 */
const DEFAULT_FORWARDER = "https://scm-scx-forwarder.scmjs.dev";

const DEFAULT_SETTINGS: Settings = { forwarder: DEFAULT_FORWARDER, lastQuery: "", sort: "relevancy" };

function loadSettings(api: PluginApi): Settings {
  return { ...DEFAULT_SETTINGS, ...api.storage.get<Partial<Settings>>("settings", {}) };
}

function saveSettings(api: PluginApi, s: Settings) {
  api.storage.set("settings", s);
}

/** The site first, then the forwarder if there is one. */
function basesFor(settings: Settings): string[] {
  const forwarder = normalizeAddress(settings.forwarder);
  return forwarder ? [SCMSCX, forwarder] : [SCMSCX];
}

const problem = (err: unknown) => (err instanceof ScmscxError ? err.sentence : err instanceof Error ? err.message : String(err));

/** A status line: plain text, `error` red, `ok` green. */
function statusLine(): { el: HTMLElement; set(text: string, kind?: "error" | "ok"): void } {
  const el = h("div", { className: "sx-status" });
  return {
    el,
    set(text, kind) {
      el.textContent = text;
      el.className = `sx-status${kind ? ` ${kind}` : ""}`;
    },
  };
}

/** The address of the site's own search page for a query, for a new tab. */
function siteSearchUrl(query: string): string {
  const q = query.trim();
  return q ? `${SCMSCX}/search/${encodeURIComponent(q)}` : `${SCMSCX}/search`;
}

/* ── Why the site could not be reached ──────────────────── */

function unreachableNotice(err: ScmscxError, query: string, onSettings: () => void): HTMLElement {
  const box = h("div", { className: "sx-sec" }, h("header", null, "Not connected"));
  box.append(
    h("p", null, "scmscx.com could not be reached from this page."),
    h("p", { className: "sx-dim" }, "The site's API sends no CORS header, so a browser lets only pages served from scmscx.com read its answers. Until the site allows it, search there in a new tab, download the map, and drop the file onto the editor."),
    h("p", { className: "sx-dim" }, "The forwarder that would otherwise pass the requests on did not answer either. Settings has its address; you can point it at one of your own."),
  );
  if (err.attempts.length) {
    box.append(h("ul", { className: "sx-attempts sx-faint" }, ...err.attempts.map((a) => h("li", null, `${a.base} — ${a.reason}`))));
  }
  box.append(
    h("div", { className: "sx-row" },
      h("button", { className: "btn sm", type: "button", onClick: () => { window.open(siteSearchUrl(query), "_blank", "noopener"); } }, "Open scmscx.com in a new tab"),
      h("button", { className: "btn sm", type: "button", onClick: onSettings }, "Settings…"),
    ),
  );
  return box;
}

/* ── Opening a map ──────────────────────────────────────── */

/**
 * Download a map and make it the open document. False when the user kept the current
 * map or the file did not open (the editor's status bar says why).
 */
async function openMap(api: PluginApi, client: ScmscxClient, info: MapInfo, status: (text: string, kind?: "error" | "ok") => void): Promise<boolean> {
  const fileName = downloadName(info);
  status(`Downloading ${fileName} (${formatSize(info.mpqSize)})…`);
  const bytes = await client.file(info.mpqHash);
  status(`Opening ${fileName}…`);
  const opened = await api.document.open(bytes, fileName);
  if (!opened) { status("The map was not opened."); return false; }
  api.ui.status(`Opened ${fileName} from scmscx.com${describeOpened(api)}`);
  return true;
}

/** What actually landed, read back off the open map — the site's own metadata is often wrong. */
function describeOpened(api: PluginApi): string {
  const info = api.document.info();
  const stats = api.query.statistics();
  if (!info) return "";
  const starts = api.query.startLocations().length;
  return ` — ${info.width} × ${info.height} ${info.tileset}${starts > 0 ? `, ${starts} start locations` : ""}${stats ? `, ${stats.units.total} units` : ""}`;
}

/* ── Settings dialog ────────────────────────────────────── */

function openSettings(api: PluginApi) {
  const s = loadSettings(api);
  const status = statusLine();
  const forwarder = h("input", { className: "input sx-grow", type: "text", placeholder: DEFAULT_FORWARDER, value: s.forwarder });
  const report = h("div", { className: "sx-dim" });

  const save = () => {
    const text = forwarder.value.trim();
    if (text && !normalizeAddress(text)) { status.set("Enter the forwarder's address with its scheme, like https://forwarder.example.com.", "error"); return false; }
    saveSettings(api, { ...s, forwarder: normalizeAddress(text) ?? "" });
    return true;
  };

  const test = async () => {
    const text = forwarder.value.trim();
    if (text && !normalizeAddress(text)) { status.set("Enter the forwarder's address with its scheme, like https://forwarder.example.com.", "error"); return; }
    const client = new ScmscxClient({ bases: basesFor({ ...s, forwarder: text }) });
    status.set("Trying…");
    clear(report);
    try {
      const { base, latest } = await client.connect();
      status.set(base === SCMSCX ? "scmscx.com answered directly." : `scmscx.com answered through ${base}.`, "ok");
      report.textContent = `${latest.total} maps in the archive.`;
    } catch (err) {
      status.set(problem(err), "error");
      if (err instanceof ScmscxError && err.attempts.length) {
        report.append(h("ul", { className: "sx-attempts" }, ...err.attempts.map((a) => h("li", null, `${a.base} — ${a.reason}`))));
      }
    }
  };

  api.ui.dialog({
    title: "scmscx.com Settings",
    size: "md",
    buttons: [
      { label: "OK", primary: true, run: () => save() },
      { label: "Cancel" },
    ],
    mount(body) {
      const root = h("div", { className: "sx" }, h("style", null, STYLE));
      root.append(
        h("div", { className: "sx-sec" },
          h("header", null, "Connection"),
          h("p", { className: "sx-dim" }, `Requests go to ${SCMSCX} first. The site's API sends no CORS header, so a page served from anywhere else cannot read its answers; a forwarder — an address that passes each request on to the site — is tried next. The plugin comes with one; put your own here to use it instead, or empty the field for none.`),
          h("div", { className: "sx-row" }, h("label", null, "Forwarder"), forwarder, h("button", { className: "btn sm", type: "button", onClick: () => { void test(); } }, "Test")),
          report,
        ),
        status.el,
      );
      body.append(root);
    },
  });
}

/* ── Find dialog ────────────────────────────────────────── */

function openFind(api: PluginApi) {
  const settings = loadSettings(api);
  const client = new ScmscxClient({ bases: basesFor(settings) });
  const status = statusLine();
  let handle: DialogHandle | null = null;
  let rows: SearchRow[] = [];
  let total = 0;
  let fetched = 0;
  let selected: SearchRow | null = null;
  let unreachable: ScmscxError | null = null;
  const infos = new Map<string, MapInfo>();
  const loading = new Set<string>();
  let busy = false;
  let seq = 0;

  const infoFor = async (id: string): Promise<MapInfo> => {
    const cached = infos.get(id);
    if (cached) return cached;
    const info = await client.mapInfo(id);
    infos.set(id, info);
    return info;
  };

  /** Open what is selected; true closes the dialog. */
  const openSelected = async (): Promise<boolean> => {
    if (busy) return false;
    if (!selected) { status.set("Pick a map in the list first."); return false; }
    busy = true;
    try {
      const info = await infoFor(selected.id);
      return await openMap(api, client, info, status.set);
    } catch (err) {
      status.set(problem(err), "error");
      return false;
    } finally {
      busy = false;
    }
  };

  handle = api.ui.dialog({
    title: "Find on scmscx.com",
    size: "xl",
    tall: true,
    buttons: [
      { label: "Open", primary: true, run: () => openSelected() },
      { label: "Close" },
    ],
    mount(body) {
      const root = h("div", { className: "sx" }, h("style", null, STYLE));
      body.append(root);

      /* Search controls */
      const q = h("input", { className: "input sx-grow", type: "search", placeholder: "Scenario name, file name, unit or force names — or a map address from the site", value: settings.lastQuery, "aria-label": "Search" });
      const searchBtn = h("button", { className: "btn sm", type: "button", onClick: () => { void runSearch(); } }, "Search");
      const randomBtn = h("button", { className: "btn sm", type: "button", title: "One map at random among the matches", onClick: () => { void pickRandom(); } }, "Random");
      const select = (label: string, options: readonly (readonly [string, string])[], onChange: () => void) =>
        h("select", { className: "select", style: "width: auto", "aria-label": label, onChange }, ...options.map(([v, text]) => h("option", { value: v }, text)));
      const sortSel = select("Sort", SORTS, () => runSearch());
      sortSel.value = settings.sort;
      const tilesetSel = select("Tileset", [["", "Any tileset"], ...TILESETS.map((t, i) => [t, TILESET_NAMES[i]] as const)], () => runSearch());
      const minPlayers = h("input", { className: "input sx-num", type: "number", min: 0, max: 12, placeholder: "min", "aria-label": "Minimum human players", onChange: () => runSearch() });
      const maxPlayers = h("input", { className: "input sx-num", type: "number", min: 0, max: 12, placeholder: "max", "aria-label": "Maximum human players", onChange: () => runSearch() });
      const sizeSel = select("Minimum size", [["", "Any size"], ["64", "64 or larger"], ["96", "96 or larger"], ["128", "128 or larger"], ["192", "192 or larger"], ["256", "256"]], () => runSearch());
      const moreBtn = h("button", { className: "btn sm", type: "button", onClick: () => { extra.style.display = extra.style.display === "none" ? "" : "none"; } }, "More…");
      const check = (label: string, checked: boolean, title?: string) => {
        const input = h("input", { type: "checkbox", checked, onChange: () => runSearch() });
        return { input, el: h("label", { className: "sx-check", title }, input, label) };
      };
      const inUnits = check("units", true, "Match unit names");
      const inForces = check("forces", true, "Match force names");
      const inFiles = check("file names", true);
      const inScenarios = check("scenario names", true);
      const inDescriptions = check("descriptions", true);
      const incBroken = check("broken", false, "Maps the site has marked as broken");
      const incOutdated = check("outdated", false, "Maps the site has marked as outdated");
      const incUnfinished = check("unfinished", false, "Maps the site has marked as unfinished");
      const filters = h("div", { className: "sx-row wrap" }, sortSel, tilesetSel, h("span", { className: "sx-dim" }, "Players"), minPlayers, h("span", { className: "sx-dim" }, "–"), maxPlayers, sizeSel, moreBtn);
      const extra = h("div", { className: "sx-row wrap", style: "display: none" },
        h("span", { className: "sx-dim" }, "Search in"), inUnits.el, inForces.el, inFiles.el, inScenarios.el, inDescriptions.el,
        h("span", { className: "sx-dim", style: "margin-left: 8px" }, "Include"), incBroken.el, incOutdated.el, incUnfinished.el,
      );

      /* Lists and details */
      const list = h("div", { className: "sx-list", role: "listbox" });
      const more = h("button", { className: "btn sm", type: "button", style: "display: none", onClick: () => { void runSearch(true); } }, "More results");
      const count = h("span", { className: "sx-dim sx-grow" });
      const details = h("div", { className: "sx-details" });
      const resultsPane = h("div", { className: "sx-results" }, h("div", { className: "sx-row" }, q, searchBtn, randomBtn), filters, extra, list, h("div", { className: "sx-row" }, count, more));
      root.append(h("div", { className: "sx-find" }, resultsPane, details), status.el);

      const query = (offset = 0): SearchQuery => {
        const minSize = sizeSel.value ? Number(sizeSel.value) : undefined;
        return {
          query: q.value,
          sort: sortSel.value as Sort,
          offset,
          unitNames: inUnits.input.checked,
          forceNames: inForces.input.checked,
          fileNames: inFiles.input.checked,
          scenarioNames: inScenarios.input.checked,
          scenarioDescriptions: inDescriptions.input.checked,
          tilesets: tilesetSel.value ? [tilesetSel.value as TilesetKey] : [],
          minWidth: minSize,
          minHeight: minSize,
          minHumans: minPlayers.value ? Number(minPlayers.value) : undefined,
          maxHumans: maxPlayers.value ? Number(maxPlayers.value) : undefined,
          includeBroken: incBroken.input.checked,
          includeOutdated: incOutdated.input.checked,
          includeUnfinished: incUnfinished.input.checked,
        };
      };

      const thumb = (id: string) => {
        const box = h("div", { className: "sx-thumb" });
        box.append(h("img", { src: minimapUrl(id), alt: "", loading: "lazy", onError: () => { box.className = "sx-thumb none"; box.textContent = "no picture"; } }));
        return box;
      };

      const renderList = () => {
        clear(list);
        for (const row of rows) {
          const el = h("div", { className: `sx-item${selected?.id === row.id ? " on" : ""}`, role: "option", onClick: () => { void pick(row); }, onDblClick: () => { void openSelected().then((ok) => { if (ok) handle?.close(); }); } },
            thumb(row.id),
            h("div", { className: "sx-item-text" },
              h("b", { className: "sx-item-name" }, row.name),
              h("div", { className: "sx-dim sx-item-sub" }, [row.fileNames.join(", "), formatDate(row.lastModified)].filter(Boolean).join(" · ")),
            ),
          );
          list.append(el);
        }
        if (rows.length === 0 && !unreachable) list.append(h("div", { className: "sx-faint", style: "padding: 8px" }, "Nothing found."));
      };

      const renderDetails = () => {
        clear(details);
        if (unreachable) { details.append(unreachableNotice(unreachable, q.value, () => openSettings(api))); return; }
        if (!selected) { details.append(h("p", { className: "sx-faint" }, "Pick a map to see its details.")); return; }
        const row = selected;
        const info = infos.get(row.id);
        details.append(h("h3", null, info?.name || row.name));
        details.append(h("img", { className: "sx-big", src: minimapUrl(row.id), alt: "", onError: (e: Event) => { (e.target as HTMLElement).remove(); } }));
        if (!info) {
          details.append(h("p", { className: "sx-dim" }, loading.has(row.id) ? "Loading the details…" : "The details could not be loaded."));
          details.append(h("p", null, link(row.url, "Its page on scmscx.com")));
          return;
        }
        const kv = h("div", { className: "sx-kv" });
        const pair = (k: string, v: string) => { if (v) kv.append(h("span", null, k), h("span", null, v)); };
        pair("Files", info.fileNames.map((f) => f.name).join(", ") || row.fileNames.join(", "));
        pair("Size", `${info.width}×${info.height}, ${tilesetName(info.tileset)}`);
        pair("Players", playersLabel(info));
        pair("Version", versionName(info.version));
        pair("Triggers", triggersLabel(info));
        pair("Objects", objectsLabel(info));
        pair("EUD", eudLabel(info));
        pair("File", formatSize(info.mpqSize));
        pair("Uploaded", [formatDate(info.uploaded), info.uploadedBy && info.uploadedBy !== "anonymous" ? `by ${info.uploadedBy}` : ""].filter(Boolean).join(" "));
        pair("Downloads", `${info.downloads}, ${info.views} view${info.views === 1 ? "" : "s"}`);
        details.append(kv);
        if (info.description) details.append(h("p", { className: "sx-dim" }, info.description));
        const forces = info.forces.filter((f) => f.players.length);
        if (forces.length) details.append(h("p", { className: "sx-faint" }, forces.map((f) => `${f.name || "Force"}: ${f.players.length} player${f.players.length === 1 ? "" : "s"}`).join(" · ")));
        details.append(h("p", null, link(info.url, "Its page on scmscx.com")));
      };

      const pick = async (row: SearchRow) => {
        selected = row;
        renderList();
        renderDetails();
        if (infos.has(row.id) || loading.has(row.id)) return;
        loading.add(row.id);
        try {
          await infoFor(row.id);
        } catch (err) {
          if (selected?.id === row.id) status.set(problem(err), "error");
        } finally {
          loading.delete(row.id);
          if (selected?.id === row.id) renderDetails();
        }
      };

      const show = (found: { rows: SearchRow[]; total: number; fetched: number }, append: boolean, label?: string) => {
        rows = append ? [...rows, ...found.rows.filter((r) => !rows.some((have) => have.id === r.id))] : found.rows;
        total = found.total;
        fetched = append ? fetched + found.fetched : found.fetched;
        selected = rows.find((r) => r.id === selected?.id) ?? null;
        count.textContent = label ?? `${total} map${total === 1 ? "" : "s"}${rows.length < total ? `, ${rows.length} listed` : ""}`;
        more.style.display = fetched < total && found.fetched > 0 ? "" : "none";
        renderList();
        renderDetails();
      };

      /** One map by id, as the only row — a pasted address, or the random pick. */
      const showOne = async (id: string, mine: number, label: string) => {
        status.set("Loading the map…");
        try {
          const info = await infoFor(id);
          if (mine !== seq) return;
          const row: SearchRow = { id, name: info.name || downloadName(info), fileNames: info.fileNames.map((f) => f.name), lastModified: info.fileNames[0]?.modified ?? null, uploaded: info.uploaded, url: info.url };
          show({ rows: [row], total: 1, fetched: 1 }, false, label);
          selected = row;
          renderList();
          renderDetails();
          status.set("");
        } catch (err) {
          if (mine !== seq) return;
          status.set(problem(err), "error");
        }
      };

      const runSearch = async (append = false) => {
        if (unreachable) return;
        const mine = ++seq;
        saveSettings(api, { ...loadSettings(api), lastQuery: q.value, sort: sortSel.value as Sort });
        const ref = parseMapRef(q.value);
        if (ref && !append) { await showOne(ref, mine, "1 map, by address"); return; }
        status.set(append ? "Loading more…" : "Searching scmscx.com…");
        try {
          const found = await client.search(query(append ? fetched : 0));
          if (mine !== seq) return;
          show(found, append);
          status.set("");
        } catch (err) {
          if (mine !== seq) return;
          status.set(problem(err), "error");
        }
      };

      const pickRandom = async () => {
        if (unreachable) return;
        const mine = ++seq;
        status.set("Picking a map at random…");
        try {
          const id = await client.random(query());
          if (mine !== seq) return;
          await showOne(id, mine, "1 map, at random");
        } catch (err) {
          if (mine !== seq) return;
          status.set(problem(err), "error");
        }
      };

      let timer = 0;
      q.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { void runSearch(); }, 350);
      });
      q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); window.clearTimeout(timer); void runSearch(); } });

      /* Connect: the newest uploads come with the first answer, and say whether the site can be read at all. */
      const mine = ++seq;
      status.set("Connecting to scmscx.com…");
      renderDetails();
      void client.connect().then(({ latest }) => {
        if (mine !== seq) return;
        status.set("");
        if (q.value.trim()) { void runSearch(); return; }
        show(latest, false, `${latest.total} maps, newest uploads first`);
      }).catch((err) => {
        if (mine !== seq) return;
        unreachable = err instanceof ScmscxError ? err : new ScmscxError("unreachable", problem(err));
        status.set(problem(err), "error");
        count.textContent = "";
        renderList();
        renderDetails();
      });
      setTimeout(() => q.focus(), 0);
      return () => { window.clearTimeout(timer); seq++; };
    },
  });
}

/* ── Activation ─────────────────────────────────────────── */

export default function activate(api: PluginApi) {
  // Named actions, so another plugin (or a future command palette) can open the search.
  api.commands.register({ id: "find", title: "Find on scmscx.com…", run: () => openFind(api) });
  api.commands.register({ id: "settings", title: "scmscx.com Settings…", run: () => openSettings(api) });

  api.menu.add("File", { label: "Find on scmscx.com…", icon: "plugin", after: "Open Recent", command: "find" });
  api.menu.add("Plugins", { label: "scmscx.com Settings…", icon: "plugin", command: "settings" });
}
