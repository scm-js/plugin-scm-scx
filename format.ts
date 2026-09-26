/**
 * Pure formatting for the dialogs: dates, sizes, the names of things scmscx.com reports
 * as numbers, and the map reference a user might paste. No DOM, no network.
 */
import type { MapInfo } from "./client";
import { english, msg, type Translate } from "./i18n";

export { stripControls } from "./client";

/** A unix time in seconds as `2026-09-01`; an empty string for none. */
export function formatDate(unix: number | null | undefined): string {
  if (typeof unix !== "number" || !(unix > 0)) return "";
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

/** `12.3 KB`, `1.2 MB`. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Tileset names by ERA value. */
export const TILESET_NAMES: readonly string[] = [msg("Badlands"), msg("Space Platform"), msg("Installation"), msg("Ash World"), msg("Jungle"), msg("Desert"), msg("Ice"), msg("Twilight")];

export function tilesetName(era: number, t: Translate = english): string {
  return TILESET_NAMES[era] !== undefined ? t(TILESET_NAMES[era]) : t("tileset {n}", { n: era });
}

/** What a VER value means. */
export function versionName(ver: number, t: Translate = english): string {
  switch (ver) {
    case 59: return t("StarCraft (original)");
    case 63: return t("Hybrid (original + Brood War)");
    case 205: return t("Brood War");
    case 206: return t("Brood War (Remastered)");
    default: return ver ? t("version {n}", { n: ver }) : "";
  }
}

/** `4 human, 2 computer`; `no players` for a map with neither. */
export function playersLabel(info: Pick<MapInfo, "humans" | "computers">, t: Translate = english): string {
  const parts: string[] = [];
  if (info.humans) parts.push(t("{n} human", { n: info.humans }));
  if (info.computers) parts.push(t("{n} computer", { n: info.computers }));
  return parts.length ? parts.join(", ") : t("no players");
}

/** How a map uses extended unit deaths, if it does. */
export function eudLabel(info: Pick<MapInfo, "eudReads" | "eudWrites" | "eups">, t: Translate = english): string {
  if (!info.eudReads && !info.eudWrites && !info.eups) return "";
  const eud = info.eudReads && info.eudWrites ? t("reads and writes EUDs") : info.eudReads ? t("reads EUDs") : info.eudWrites ? t("writes EUDs") : "";
  const eup = info.eups ? t("{n, plural, one {# EUP} other {# EUPs}}", { n: info.eups }) : "";
  return [eud, eup].filter(Boolean).join(", ");
}

/** `n units · n locations · …`, leaving out zeros. */
export function objectsLabel(info: Pick<MapInfo, "units" | "doodads" | "sprites" | "locations">, t: Translate = english): string {
  return [
    info.units ? t("{n, plural, one {# unit} other {# units}}", { n: info.units }) : "",
    info.doodads ? t("{n, plural, one {# doodad} other {# doodads}}", { n: info.doodads }) : "",
    info.sprites ? t("{n, plural, one {# sprite} other {# sprites}}", { n: info.sprites }) : "",
    info.locations ? t("{n, plural, one {# location} other {# locations}}", { n: info.locations }) : "",
  ].filter(Boolean).join(" · ");
}

/** `n triggers, n briefing triggers`. */
export function triggersLabel(info: Pick<MapInfo, "triggers" | "briefingTriggers">, t: Translate = english): string {
  return info.briefingTriggers
    ? t("{n, plural, one {# trigger} other {# triggers}}, {briefing} briefing", { n: info.triggers, briefing: info.briefingTriggers })
    : t("{n, plural, one {# trigger} other {# triggers}}", { n: info.triggers });
}

/**
 * The map id in something pasted from the site — `https://scmscx.com/map/35b32Dsq`, with or
 * without the scheme, a trailing path, a query or a hash — or an editor link to a map
 * (`https://editor.scmjs.dev/scmscx/35b32Dsq`). Null for anything else: a bare id is not
 * recognised, since it would be taken for a search word.
 */
export function parseMapRef(text: string): string | null {
  const trimmed = text.trim();
  const m = /^(?:https?:\/\/)?(?:www\.)?scmscx\.com\/map\/([A-Za-z0-9]+)(?:[/?#].*)?$/i.exec(trimmed);
  if (m) return m[1];
  const link = /^https?:\/\/[^/?#]+(\/[^?#]*)(?:[?#].*)?$/i.exec(trimmed);
  return link ? mapIdOnPage(link[1]) : null;
}

/** `<base>scmscx/<id>`, with or without a trailing slash; group 1 is the base, group 2 the id. */
const LINK_PATH = /^(.*\/)scmscx\/([A-Za-z0-9]+)\/?$/;

/**
 * The map id on the editor's own address, when it was opened from a link to a map on the
 * site (`https://editor.scmjs.dev/scmscx/35b32Dsq`). The editor answers any path with its
 * one page, so nothing needs to exist at that path. Null for any other path.
 */
export function mapIdOnPage(pathname: string): string | null {
  return LINK_PATH.exec(pathname)?.[2] ?? null;
}

/** The path the editor is served from: the page's path less a `scmscx/<id>` on the end. */
export function editorBase(pathname: string): string {
  return LINK_PATH.exec(pathname)?.[1] ?? pathname;
}

/** A forwarder address the way the client wants it: scheme required, no trailing slash. Null when blank or unusable. */
export function normalizeAddress(text: string): string | null {
  const trimmed = text.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed).hostname ? trimmed : null;
  } catch {
    return null;
  }
}

/** The file name to open a download under: the site's first, else the id. */
export function downloadName(info: Pick<MapInfo, "id" | "fileNames">): string {
  const first = info.fileNames[0]?.name?.trim();
  if (first && /\.(scx|scm|chk)$/i.test(first)) return first;
  return first ? `${first}.scx` : `${info.id}.scx`;
}
