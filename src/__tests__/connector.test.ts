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
    expect(c.meta.capabilities).toContain("login");
    const f = c.meta.configSchema?.find(x => x.key === "apiBaseUrl");
    expect(f?.required).toBe(true);
    expect(c.meta.configSchema?.find(x => x.key === "authCookie")).toBeDefined();
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

  it("listPlaylists forwards sort to upstream sortId", async () => {
    let sawSortId = "";
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input.toString();
      const m = url.match(/sortId=(\d+)/);
      if (m) sawSortId = m[1];
      return Promise.resolve(new Response(JSON.stringify({ data: { total: 0, list: [] } }), {
        status: 200, headers: { "content-type": "application/json" },
      }));
    });
    const c = new QQMusicConnector();
    await c.init({ apiBaseUrl: BASE });
    await c.listPlaylists!({ sort: "new" });
    expect(sawSortId).toBe("2");
    await c.listPlaylists!({ sort: "hot" });
    expect(sawSortId).toBe("5");
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

  it("supports proxy QR login and forwards cookie to future requests", async () => {
    let sawCookie = false;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/user/qr/check")) {
        return Promise.resolve(new Response(JSON.stringify({
          code: 803,
          data: { cookie: "uin=123; qm_keyst=abc", nickname: "tester" },
        }), { status: 200, headers: { "content-type": "application/json" } }));
      }
      if (url.includes("/user/qr")) {
        return Promise.resolve(new Response(JSON.stringify({
          data: { key: "qq-key", qrurl: "https://qr.qq.test/login", qrimg: "data:image/png;base64,abc" },
        }), { status: 200, headers: { "content-type": "application/json" } }));
      }
      if (url.includes("/search")) {
        sawCookie = url.includes("cookie=uin%3D123%3B+qm_keyst%3Dabc");
        return Promise.resolve(new Response(JSON.stringify({ data: { list: [], total: 0 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return Promise.resolve(new Response("", { status: 404 }));
    });

    const c = new QQMusicConnector();
    await c.init({ apiBaseUrl: BASE });
    const start = await c.login({ intent: "start" });
    expect(start.flow).toBe("qr");
    expect(start.flowId).toBe("qq-key");
    expect(start.actions?.[0]?.type).toBe("qr");

    const done = await c.login({ intent: "continue", flowId: "qq-key" });
    expect(done.status).toBe("authenticated");
    expect(done.configPatch).toEqual({ authCookie: "uin=123; qm_keyst=abc" });

    await c.search({ keyword: "周杰伦" });
    expect(sawCookie).toBe(true);
  });
});
