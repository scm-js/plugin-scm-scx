import { describe, expect, it } from "vitest";
import { mapInfoFrom, mergeRows, randomPath, ScmscxClient, ScmscxError, searchPath, SCMSCX, minimapUrl, mapPageUrl, type Fetch, type RawInfo } from "../client";

interface Call { url: string; init: RequestInit }

/** A fetch that records calls and answers from a script of responses. */
function fakeFetch(answers: ((call: Call) => Response | Promise<Response>)[]): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init = {}) => {
    const call = { url, init };
    calls.push(call);
    const answer = answers.shift();
    if (!answer) throw new Error(`unexpected request ${url}`);
    return answer(call);
  };
  return { fetch, calls };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = () => new Response("<!doctype html><title>x</title>", { status: 200, headers: { "content-type": "text/html" } });
const cors = () => Promise.reject(new TypeError("Failed to fetch"));

const LATEST = { maps: [{ filename: "a.scx", id: "aaaaaaaa", last_modified: 1788236092, scenario_name: "A", uploaded_time: 1788310866 }], total_results: 1 };

describe("searchPath", () => {
  it("leaves every default out, as the site's front end does", () => {
    expect(searchPath({})).toBe("/api/uiv2/search");
    expect(searchPath({ sort: "relevancy", unitNames: true, tilesets: [], minWidth: 0, maxWidth: 256, maxHumans: 12, includeBroken: false })).toBe("/api/uiv2/search");
  });
  it("puts the words in the path and the rest in the query string", () => {
    expect(searchPath({ query: " lost temple ", sort: "lastmodifiednew" })).toBe("/api/uiv2/search/lost%20temple?sort=lastmodifiednew");
    expect(searchPath({ query: "x", unitNames: false, scenarioDescriptions: false })).toBe("/api/uiv2/search/x?unit_names=false&scenario_descriptions=false");
  });
  it("turns a tileset choice into the other tilesets switched off", () => {
    expect(searchPath({ tilesets: ["jungle"] })).toBe(
      "/api/uiv2/search?tileset_badlands=false&tileset_space_platform=false&tileset_installation=false&tileset_ashworld=false&tileset_desert=false&tileset_ice=false&tileset_twilight=false",
    );
    expect(searchPath({ tilesets: ["badlands", "space_platform", "installation", "ashworld", "jungle", "desert", "ice", "twilight"] })).toBe("/api/uiv2/search");
  });
  it("sends sizes, players, flags and the offset", () => {
    expect(searchPath({ minWidth: 128, minHeight: 128, minHumans: 2, maxHumans: 4, includeBroken: true, includeUnfinished: true, offset: 50, uploadedBy: " bob " })).toBe(
      "/api/uiv2/search?minimum_map_width=128&minimum_map_height=128&minimum_human_players=2&maximum_human_players=4&uploaded_by=bob&include_broken=true&include_unfinished=true&offset=50",
    );
  });
  it("has a random twin", () => {
    expect(randomPath({ query: "zone", sort: "scenario" })).toBe("/api/uiv2/random/zone?sort=scenario");
    expect(randomPath({})).toBe("/api/uiv2/random");
  });
});

describe("mergeRows", () => {
  it("merges the site's one-row-per-file-name into one row per map", () => {
    const rows = mergeRows([
      { id: "m1", scenario_name: "Zone Control", filename: "zc.scx", last_modified: 100, uploaded_time: 200 },
      { id: "m1", scenario_name: "Zone Control", filename: "zc v2.scx", last_modified: 300, uploaded_time: 200 },
      { id: "m2", scenario_name: "", filename: null, last_modified: -1, uploaded_time: 400 },
      { id: "", scenario_name: "dropped" },
    ]);
    expect(rows).toEqual([
      { id: "m1", name: "Zone Control", fileNames: ["zc.scx", "zc v2.scx"], lastModified: 300, uploaded: 200, url: `${SCMSCX}/map/m1` },
      { id: "m2", name: "m2", fileNames: [], lastModified: null, uploaded: 400, url: `${SCMSCX}/map/m2` },
    ]);
  });
});

describe("mapInfoFrom", () => {
  const RAW: RawInfo = {
    scenario: "Space Odyssey",
    scenario_description: "desc\r\nmore",
    player_owners: [6, 6, 6, 6, 5, 5, 5, 5, 0, 0, 0, 0],
    forces: [{ name: "Air Force 1", player_ids: [0, 1, 2, 3] }, { name: "Force 4", player_ids: [] }],
    meta: { chkhash: "c", mpq_hash: "m", mpq_size: 3777275, chk_size: 17030480, uploaded_by: "anonymous", uploaded_time: 1788310869, downloads: 2, views: 6 },
    properties: { width: 128, height: 128, tileset: 1, ver: 206, triggers: 82, briefing_triggers: 2, units: 70, locations: 255, doodads: 0, sprites: 84, unique_terrain_tiles: 348, get_death_euds: 1, set_death_euds: 40, eups: 0 },
  };
  it("reads the details, counts players by owner and keeps the file names", () => {
    const info = mapInfoFrom("35b32Dsq", RAW, [{ filename: "s.scx", modified_time: 1786510907 }, { filename: "" }, { filename: "s.scx", modified_time: 1786510000 }, { filename: "t.scm", modified_time: 3 }]);
    expect(info).toMatchObject({
      id: "35b32Dsq", name: "Space Odyssey", description: "desc\r\nmore", chkHash: "c", mpqHash: "m", mpqSize: 3777275,
      width: 128, height: 128, tileset: 1, version: 206, triggers: 82, briefingTriggers: 2, units: 70, locations: 255, sprites: 84,
      eudReads: 1, eudWrites: 40, humans: 4, computers: 4, uploadedBy: "anonymous", uploaded: 1788310869, downloads: 2, views: 6,
      fileNames: [{ name: "s.scx", modified: 1786510907 }, { name: "t.scm", modified: 3 }], url: `${SCMSCX}/map/35b32Dsq`,
    });
    expect(info.forces).toEqual([{ name: "Air Force 1", players: [0, 1, 2, 3] }, { name: "Force 4", players: [] }]);
  });
  it("copes with an answer missing most of it", () => {
    const info = mapInfoFrom("x", { meta: { mpq_hash: "m" } }, null);
    expect(info).toMatchObject({ name: "", width: 0, humans: 0, computers: 0, forces: [], fileNames: [], uploaded: null });
  });
});

describe("ScmscxClient", () => {
  it("connects to the site itself when it answers, and hands back the newest uploads", async () => {
    const { fetch, calls } = fakeFetch([json(LATEST)]);
    const client = new ScmscxClient({ bases: ["https://scmscx.com/", "https://fwd.example"], fetch });
    const { base, latest } = await client.connect();
    expect(base).toBe("https://scmscx.com");
    expect(client.base).toBe("https://scmscx.com");
    expect(calls[0].url).toBe("https://scmscx.com/api/uiv2/search?sort=timeuploadednew");
    expect(latest.rows.map((r) => r.name)).toEqual(["A"]);
    expect(latest.total).toBe(1);
  });

  it("falls through to the forwarder when the browser refuses the site, and keeps using it", async () => {
    const { fetch, calls } = fakeFetch([cors, json(LATEST), json(LATEST)]);
    const client = new ScmscxClient({ bases: ["https://scmscx.com", "https://fwd.example"], fetch });
    expect((await client.connect()).base).toBe("https://fwd.example");
    await client.search({ query: "zone" });
    expect(calls.map((c) => c.url)).toEqual([
      "https://scmscx.com/api/uiv2/search?sort=timeuploadednew",
      "https://fwd.example/api/uiv2/search?sort=timeuploadednew",
      "https://fwd.example/api/uiv2/search/zone",
    ]);
  });

  it("does not take a forwarder that answers with a web page or an error", async () => {
    const { fetch } = fakeFetch([cors, html, json({ error: "no" }, 502)]);
    const client = new ScmscxClient({ bases: ["https://scmscx.com", "https://static.example", "https://down.example"], fetch });
    const err = await client.connect().catch((e) => e);
    expect(err).toBeInstanceOf(ScmscxError);
    expect(err.code).toBe("unreachable");
    expect(err.sentence).toBe("scmscx.com could not be reached from this page.");
    expect(err.attempts).toEqual([
      { base: "https://scmscx.com", reason: "Failed to fetch" },
      { base: "https://static.example", reason: "answered with something that is not the search API" },
      { base: "https://down.example", reason: "answered 502" },
    ]);
    expect(client.base).toBeNull();
  });

  it("connects on first use when nobody called connect", async () => {
    const { fetch, calls } = fakeFetch([json(LATEST), json("Yb9hjY27")]);
    const client = new ScmscxClient({ bases: ["https://scmscx.com"], fetch });
    expect(await client.random({ query: "x" })).toBe("Yb9hjY27");
    expect(calls.map((c) => c.url)).toEqual(["https://scmscx.com/api/uiv2/search?sort=timeuploadednew", "https://scmscx.com/api/uiv2/random/x"]);
  });

  it("reads a map's details and its file names, and survives the file-name route failing", async () => {
    const raw: RawInfo = { scenario: "Z", meta: { mpq_hash: "m" }, properties: { width: 64, height: 64 } };
    const { fetch, calls } = fakeFetch([json(LATEST), json(raw), json([{ filename: "z.scx", modified_time: 5 }]), json(raw), () => new Response("nope", { status: 500 })]);
    const client = new ScmscxClient({ bases: ["https://scmscx.com"], fetch });
    const info = await client.mapInfo("abc");
    expect(info.fileNames).toEqual([{ name: "z.scx", modified: 5 }]);
    expect(calls[1].url).toBe("https://scmscx.com/api/uiv2/map_info/abc");
    expect(calls[2].url).toBe("https://scmscx.com/api/uiv2/filenames2/abc");
    const again = await client.mapInfo("abc");
    expect(again.fileNames).toEqual([]);
  });

  it("says not found for an unknown map: a 500 from map_info, a 404 from the file route", async () => {
    const { fetch } = fakeFetch([json(LATEST), () => new Response("", { status: 500 }), () => new Response("", { status: 404 }), () => new Response("", { status: 503 })]);
    const client = new ScmscxClient({ bases: ["https://scmscx.com"], fetch });
    await expect(client.mapInfo("zzz")).rejects.toMatchObject({ code: "not_found", sentence: "scmscx.com has no such map." });
    await expect(client.file("nohash")).rejects.toMatchObject({ code: "not_found" });
    await expect(client.file("hash")).rejects.toMatchObject({ code: "http", status: 503, sentence: "scmscx.com answered 503." });
  });

  it("downloads the file by its MPQ hash as bytes", async () => {
    const { fetch, calls } = fakeFetch([json(LATEST), () => new Response(new Uint8Array([0x4d, 0x50, 0x51, 0x1a]), { status: 200, headers: { "content-type": "application/octet-stream" } })]);
    const client = new ScmscxClient({ bases: ["https://scmscx.com"], fetch });
    const bytes = await client.file("eaa6");
    expect([...bytes]).toEqual([0x4d, 0x50, 0x51, 0x1a]);
    expect(calls[1].url).toBe("https://scmscx.com/api/maps/eaa6");
    expect(new Headers(calls[1].init.headers).get("accept")).toBe("application/octet-stream");
  });

  it("rejects an answer that is not JSON once connected", async () => {
    const { fetch } = fakeFetch([json(LATEST), html]);
    const client = new ScmscxClient({ bases: ["https://scmscx.com"], fetch });
    await expect(client.search({ query: "x" })).rejects.toMatchObject({ code: "bad_response" });
  });

  it("names the site's pages and minimaps", () => {
    expect(mapPageUrl("35b32Dsq")).toBe("https://scmscx.com/map/35b32Dsq");
    expect(minimapUrl("35b32Dsq")).toBe("https://scmscx.com/api/uiv2/minimap/35b32Dsq");
  });
});
