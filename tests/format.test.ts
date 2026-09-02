import { describe, expect, it } from "vitest";
import { downloadName, eudLabel, formatDate, formatSize, normalizeAddress, objectsLabel, parseMapRef, playersLabel, stripControls, tilesetName, triggersLabel, versionName } from "../format";

describe("format", () => {
  it("formats dates from unix seconds and sizes from bytes", () => {
    expect(formatDate(1788310869)).toBe("2026-09-02");
    expect(formatDate(null)).toBe("");
    expect(formatDate(-1)).toBe("");
    expect(formatSize(3777275)).toBe("3.6 MB");
    expect(formatSize(900)).toBe("900 B");
    expect(formatSize(-1)).toBe("");
  });

  it("strips StarCraft's colour bytes", () => {
    expect(stripControls("Space Odyssey S  v1.1")).toBe("Space Odyssey S  v1.1");
    expect(stripControls("a\r\nb\tc")).toBe("a\r\nb\tc");
    expect(stripControls(null)).toBe("");
  });

  it("names tilesets and versions", () => {
    expect(tilesetName(1)).toBe("Space Platform");
    expect(tilesetName(9)).toBe("tileset 9");
    expect(versionName(59)).toBe("StarCraft (original)");
    expect(versionName(63)).toBe("Hybrid (original + Brood War)");
    expect(versionName(205)).toBe("Brood War");
    expect(versionName(206)).toBe("Brood War (Remastered)");
    expect(versionName(0)).toBe("");
  });

  it("labels players, triggers, objects and EUD use", () => {
    expect(playersLabel({ humans: 4, computers: 2 })).toBe("4 human, 2 computer");
    expect(playersLabel({ humans: 0, computers: 0 })).toBe("no players");
    expect(triggersLabel({ triggers: 1, briefingTriggers: 0 })).toBe("1 trigger");
    expect(triggersLabel({ triggers: 82, briefingTriggers: 2 })).toBe("82 triggers, 2 briefing");
    expect(objectsLabel({ units: 70, doodads: 0, sprites: 1, locations: 255 })).toBe("70 units · 1 sprite · 255 locations");
    expect(eudLabel({ eudReads: 0, eudWrites: 0, eups: 0 })).toBe("");
    expect(eudLabel({ eudReads: 1, eudWrites: 40, eups: 0 })).toBe("reads and writes EUDs");
    expect(eudLabel({ eudReads: 0, eudWrites: 2, eups: 1 })).toBe("writes EUDs, 1 EUP");
  });

  it("recognises a pasted map address and nothing else", () => {
    expect(parseMapRef("https://scmscx.com/map/35b32Dsq")).toBe("35b32Dsq");
    expect(parseMapRef(" scmscx.com/map/35b32Dsq#sort=scenario ")).toBe("35b32Dsq");
    expect(parseMapRef("https://www.scmscx.com/map/35b32Dsq/")).toBe("35b32Dsq");
    expect(parseMapRef("35b32Dsq")).toBeNull();
    expect(parseMapRef("https://scmscx.com/search/lost")).toBeNull();
    expect(parseMapRef("lost temple")).toBeNull();
  });

  it("normalises a forwarder address", () => {
    expect(normalizeAddress(" https://fwd.example/ ")).toBe("https://fwd.example");
    expect(normalizeAddress("http://localhost:8080/scmscx/")).toBe("http://localhost:8080/scmscx");
    expect(normalizeAddress("fwd.example")).toBeNull();
    expect(normalizeAddress("")).toBeNull();
  });

  it("picks a file name to open the download under", () => {
    expect(downloadName({ id: "abc", fileNames: [{ name: "Lost Temple.scx", modified: null }] })).toBe("Lost Temple.scx");
    expect(downloadName({ id: "abc", fileNames: [{ name: "odd", modified: null }] })).toBe("odd.scx");
    expect(downloadName({ id: "abc", fileNames: [] })).toBe("abc.scx");
  });
});
