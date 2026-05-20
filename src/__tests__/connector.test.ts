import { afterEach, describe, expect, it, vi } from "vitest";
import { QQMusicConnector } from "../index";

const BASE = "https://mock-qq.test";

function mockFetch(map: Record<string, unknown>) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, body] of Object.entries(map)) {
      if (url.includes(pattern)) {
        return Promise.resolve(new Response(JSON.stringify(body), {
          status: 200, headers: { "content-type": "application/json" },
        }));
      }
    }
    return Promise.resolve(new Response("", { status: 404 }));
  });
}

describe("QQMusicConnector (contract)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("declares meta + required configSchema for apiBaseUrl", () => {
    const c = new QQMusicConnector();
    expect(c.meta.id).toBe("qq-music");
    const f = c.meta.configSchema?.find(x => x.key === "apiBaseUrl");
    expect(f?.required).toBe(true);
  });

  it("returns empty when apiBaseUrl is missing", async () => {
    const c = new QQMusicConnector();
    await c.init();
    const r = await c.search({ keyword: "test" });
    expect(r.tracks).toEqual([]);
  });

  it("search returns track-shaped results when configured", async () => {
    mockFetch({
      "/search": {
        result: 100,
        data: {
          list: [{
            songmid: "001fakp82WoZ8u",
            songname: "晴天",
            singer: [{ name: "周杰伦" }],
            albumname: "叶惠美",
            albummid: "002Neh8l0RxIPZ",
            interval: 269,
          }],
          total: 1,
        },
      },
    });
    const c = new QQMusicConnector();
    await c.init({ apiBaseUrl: BASE });
    const r = await c.search({ keyword: "周杰伦", pageSize: 10 });
    expect(r.tracks).toHaveLength(1);
    const t = r.tracks[0];
    expect(t.id).toBe("qq:001fakp82WoZ8u");
    expect(t.title).toBe("晴天");
    expect(t.artist).toBe("周杰伦");
    expect(t.album).toBe("叶惠美");
    expect(t.coverUrl).toContain("y.gtimg.cn/music");
    expect(t.durationSec).toBe(269);
  });

  it("listPlaylists returns playlist-shaped results", async () => {
    mockFetch({
      "/top/playlist": {
        data: {
          total: 1,
          list: [{
            dissid: 8675309,
            dissname: "经典华语",
            imgurl: "https://y.gtimg.cn/x.jpg",
            song_count: 50,
            creator: { name: "QQ官方" },
            introduction: "时代金曲",
          }],
        },
      },
    });
    const c = new QQMusicConnector();
    await c.init({ apiBaseUrl: BASE });
    const r = await c.listPlaylists!();
    expect(r.playlists).toHaveLength(1);
    const p = r.playlists[0];
    expect(p.id).toBe("qq-playlist:8675309");
    expect(p.name).toBe("经典华语");
    expect(p.trackCount).toBe(50);
    expect(p.externalUrl).toContain("y.qq.com");
  });

  it("getPlaylistTracks returns the playlist songs", async () => {
    mockFetch({
      "/playlist": {
        data: {
          songlist: [{
            songmid: "001fakp82WoZ8u",
            songname: "晴天",
            singer: [{ name: "周杰伦" }],
            albumname: "叶惠美",
            albummid: "002Neh8l0RxIPZ",
            interval: 269,
          }],
        },
      },
    });
    const c = new QQMusicConnector();
    await c.init({ apiBaseUrl: BASE });
    const r = await c.getPlaylistTracks!("qq-playlist:8675309");
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0].id).toBe("qq:001fakp82WoZ8u");
  });

  it("getStreamUrl returns a playable url", async () => {
    mockFetch({
      "/song/url": {
        result: 100,
        data: { playUrl: { "001fakp82WoZ8u": "https://aqqmusic.tc.qq.com/x/path/file.mp3" } },
      },
    });
    const c = new QQMusicConnector();
    await c.init({ apiBaseUrl: BASE });
    const info = await c.getStreamUrl("qq:001fakp82WoZ8u");
    expect(info).not.toBeNull();
    expect(info!.url).toMatch(/^https?:\/\//);
    expect(info!.format).toBe("mp3");
  });
});
