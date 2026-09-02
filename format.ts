/**
 * Pure formatting for the dialogs: dates, sizes, the names of things scmscx.com reports
 * as numbers, and the map reference a user might paste. No DOM, no network.
 */
import type { MapInfo } from "./client";

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
export const TILESET_NAMES: readonly string[] = ["Badlands", "Space Platform", "Installation", "Ash World", "Jungle", "Desert", "Ice", "Twilight"];

export function tilesetName(era: number): string {
  return TILESET_NAMES[era] ?? `tileset ${era}`;
}

/** What a VER value means. */
export function versionName(ver: number): string {
  switch (ver) {
    case 59: return "StarCraft (original)";
    case 63: return "Hybrid (original + Brood War)";
    case 205: return "Brood War";
    case 206: return "Brood War (Remastered)";
    default: return ver ? `version ${ver}` : "";
  }
}

/** `4 human, 2 computer`; `no players` for a map with neither. */
export function playersLabel(info: Pick<MapInfo, "humans" | "computers">): string {
  const parts: string[] = [];
  if (info.humans) parts.push(`${info.humans} human`);
  if (info.computers) parts.push(`${info.computers} computer`);
  return parts.length ? parts.join(", ") : "no players";
}

/** How a map uses extended unit deaths, if it does. */
export function eudLabel(info: Pick<MapInfo, "eudReads" | "eudWrites" | "eups">): string {
  const parts: string[] = [];
  if (info.eudReads) parts.push("reads");
  if (info.eudWrites) parts.push("writes");
  if (!parts.length && !info.eups) return "";
  const eud = parts.length ? `${parts.join(" and ")} EUDs` : "";
  const eup = info.eups ? `${info.eups} EUP${info.eups === 1 ? "" : "s"}` : "";
  return [eud, eup].filter(Boolean).join(", ");
}

/** `n units · n locations · …`, leaving out zeros. */
export function objectsLabel(info: Pick<MapInfo, "units" | "doodads" | "sprites" | "locations">): string {
  const one = (n: number, word: string) => (n ? `${n} ${word}${n === 1 ? "" : "s"}` : "");
  return [one(info.units, "unit"), one(info.doodads, "doodad"), one(info.sprites, "sprite"), one(info.locations, "location")].filter(Boolean).join(" · ");
}

/** `n triggers, n briefing triggers`. */
export function triggersLabel(info: Pick<MapInfo, "triggers" | "briefingTriggers">): string {
  const t = `${info.triggers} trigger${info.triggers === 1 ? "" : "s"}`;
  return info.briefingTriggers ? `${t}, ${info.briefingTriggers} briefing` : t;
}

/**
 * The map id in something pasted from the site — `https://scmscx.com/map/35b32Dsq`, with or
 * without the scheme, a trailing path, a query or a hash. Null for anything else: a bare
 * id is not recognised, since it would be taken for a search word.
 */
export function parseMapRef(text: string): string | null {
  const m = /^(?:https?:\/\/)?(?:www\.)?scmscx\.com\/map\/([A-Za-z0-9]+)(?:[/?#].*)?$/i.exec(text.trim());
  return m ? m[1] : null;
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
