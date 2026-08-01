// src/index.ts
var QQ_MUSIC_ARTWORK_ORIGINS = ["https://y.gtimg.cn", "https://y.qq.com"];
function validateBaseUrl(value) {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("QQ \u97F3\u4E50\u7F51\u5173\u5FC5\u987B\u4F7F\u7528 HTTPS\uFF1B\u672C\u5730\u5F00\u53D1\u4EC5\u5141\u8BB8 loopback HTTP");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("QQ \u97F3\u4E50\u7F51\u5173\u5730\u5740\u4E0D\u80FD\u5305\u542B\u5185\u5D4C\u51ED\u636E\u3001\u67E5\u8BE2\u53C2\u6570\u6216\u7247\u6BB5");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}
function joinSinger(s) {
  if (!s.singer) return "";
  return s.singer.map((x) => x?.name).filter(Boolean).join(", ");
}
function albumCover(mid) {
  if (!mid) return void 0;
  return `${QQ_MUSIC_ARTWORK_ORIGINS[0]}/music/photo_new/T002R300x300M000${mid}.jpg`;
}
function artworkUrl(value) {
  const raw = value?.trim();
  if (!raw) return void 0;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return new URL(raw, QQ_MUSIC_ARTWORK_ORIGINS[1]).toString();
  return raw.replace(/^http:\/\//i, "https://");
}
function toTrack(s) {
  const id = s.songmid || "";
  return {
    id: `qq:${id}`,
    title: s.songname || "Unknown",
    artist: joinSinger(s) || "Unknown",
    album: s.albumname,
    coverUrl: albumCover(s.albummid),
    durationSec: s.interval ?? 0,
    price: 0,
    currency: "CNY",
    version: "1.0.0",
    createdAt: "",
    updatedAt: ""
  };
}
var QQMusicConnector = class {
  constructor() {
    this.meta = {
      id: "qq-music",
      name: "QQ \u97F3\u4E50",
      description: "Anonymous QQ Music catalog through a compatible self-hosted gateway",
      familyId: "qq-music",
      variant: "anonymous",
      authRequirement: "none",
      supportedHosts: ["web", "desktop"],
      version: "0.5.5",
      capabilities: ["search", "stream", "playlist"],
      configSchema: [
        {
          key: "apiBaseUrl",
          label: "QQ Music API \u7AEF\u70B9",
          type: "url",
          required: false,
          placeholder: "https://your-qqmusic-api.example.com",
          help: "\u9700\u8981\u517C\u5BB9\u672C\u4ED3\u5E93\u6587\u6863\u6240\u5217\u8DEF\u7531\u7684\u81EA\u90E8\u7F72 HTTPS \u7F51\u5173\u3002\u672A\u914D\u7F6E\u65F6\u4E0D\u4F1A\u4F2A\u88C5\u4E3A\u53EF\u641C\u7D22\u6216\u53EF\u64AD\u653E\u3002"
        }
      ]
    };
    this.baseUrl = "";
  }
  async init(config) {
    const typed = config;
    const configuredUrl = (typed?.apiBaseUrl || "").trim();
    this.baseUrl = configuredUrl ? validateBaseUrl(configuredUrl) : "";
    if (!this.baseUrl) {
      console.warn(
        "[QQMusicConnector] apiBaseUrl not configured \u2014 QQ search will stay empty. Configure a compatible HTTPS catalog gateway before searching."
      );
    }
  }
  async search(query) {
    const keyword = (query.keyword || "").trim();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (!keyword || !this.baseUrl) {
      return { tracks: [], total: 0, page, pageSize };
    }
    const data = await this.request("/search", {
      key: keyword,
      pageNo: page,
      pageSize
    });
    const list = data.data?.list ?? data.data?.song?.list ?? [];
    const total = data.data?.total ?? data.data?.song?.totalnum ?? list.length;
    return {
      tracks: list.map(toTrack),
      total,
      page,
      pageSize
    };
  }
  async getTrack(trackId) {
    const mid = this.parseId(trackId);
    if (!mid || !this.baseUrl) return null;
    const data = await this.request("/song", { songmid: mid });
    const s = Array.isArray(data.data) ? data.data[0] : data.data;
    return s ? toTrack(s) : null;
  }
  async getStreamUrl(trackId) {
    const mid = this.parseId(trackId);
    if (!mid || !this.baseUrl) return null;
    const data = await this.request("/song/url", { id: mid });
    let url;
    if (typeof data.data === "string") url = data.data;
    else if (data.data && typeof data.data === "object") {
      url = data.data.playUrl?.[mid];
    }
    if (!url) return null;
    return { url, format: "mp3" };
  }
  async listPlaylists(query = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (!this.baseUrl) return { playlists: [], total: 0, page, pageSize };
    const sortId = query.sort === "new" ? 2 : 5;
    const data = await this.request("/top/playlist", {
      pageNo: page,
      pageSize,
      sortId,
      ...query.category ? { categoryId: query.category } : {}
    });
    const list = data.data?.list ?? [];
    return {
      playlists: list.map(toPlaylist),
      total: data.data?.total ?? list.length,
      page,
      pageSize
    };
  }
  async getPlaylistTracks(playlistId, opts = {}) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 30;
    const id = this.parsePlaylistId(playlistId);
    if (!id || !this.baseUrl) return { tracks: [], total: 0, page, pageSize };
    const data = await this.request("/playlist", { id });
    const songs = data.data?.songlist ?? [];
    return {
      tracks: songs.map(toTrack),
      total: songs.length,
      page,
      pageSize
    };
  }
  parseId(trackId) {
    if (trackId.startsWith("qq:")) return trackId.slice(3);
    return trackId || null;
  }
  parsePlaylistId(id) {
    if (id.startsWith("qq-playlist:")) return id.slice("qq-playlist:".length);
    return id || null;
  }
  async request(path, params = {}) {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15e3)
    });
    if (!res.ok) {
      throw new Error(`QQ Music API failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
};
function toPlaylist(p) {
  const id = String(p.dissid ?? p.disstid ?? "");
  return {
    id: `qq-playlist:${id}`,
    name: p.dissname || "Unknown",
    description: p.introduction,
    coverUrl: artworkUrl(p.imgurl),
    trackCount: p.song_count ?? p.song_num,
    curator: p.creator?.name,
    externalUrl: id ? `https://y.qq.com/n/ryqq/playlist/${id}` : void 0
  };
}
var index_default = QQMusicConnector;
export {
  QQMusicConnector,
  QQ_MUSIC_ARTWORK_ORIGINS,
  index_default as default
};
