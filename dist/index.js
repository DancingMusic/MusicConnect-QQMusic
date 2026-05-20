// src/index.ts
function joinSinger(s) {
  if (!s.singer) return "";
  return s.singer.map((x) => x?.name).filter(Boolean).join(", ");
}
function albumCover(mid) {
  if (!mid) return void 0;
  return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg`;
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
      description: "QQ Music data source (via self-hosted proxy API)",
      version: "0.2.0",
      capabilities: ["search", "stream"],
      configSchema: [
        {
          key: "apiBaseUrl",
          label: "QQ Music API \u7AEF\u70B9",
          type: "url",
          required: true,
          placeholder: "https://your-qqmusic-api.example.com",
          help: "\u81EA\u90E8\u7F72\u7684 Rain120/qq-music-api \u6216 jsososo/QQMusicApi \u5B9E\u4F8B\u3002QQ \u6CA1\u6709\u5B98\u65B9\u5F00\u653E API\uFF0C\u65E0\u4EE3\u7406\u5219\u65E0\u6CD5\u641C\u7D22\u3002"
        }
      ]
    };
    this.baseUrl = "";
  }
  async init(config) {
    const typed = config;
    this.baseUrl = (typed?.apiBaseUrl || "").replace(/\/$/, "");
    if (!this.baseUrl) {
      console.warn(
        "[QQMusicConnector] apiBaseUrl not configured \u2014 search will fail. Deploy https://github.com/Rain120/qq-music-api or similar."
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
    const url = `${this.baseUrl}/search?key=${encodeURIComponent(keyword)}&pageNo=${page}&pageSize=${pageSize}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`QQ Music search failed: ${res.status}`);
    const data = await res.json();
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
    const res = await fetch(`${this.baseUrl}/song?songmid=${encodeURIComponent(mid)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const s = Array.isArray(data.data) ? data.data[0] : data.data;
    return s ? toTrack(s) : null;
  }
  async getStreamUrl(trackId) {
    const mid = this.parseId(trackId);
    if (!mid || !this.baseUrl) return null;
    const res = await fetch(`${this.baseUrl}/song/url?id=${encodeURIComponent(mid)}`);
    if (!res.ok) return null;
    const data = await res.json();
    let url;
    if (typeof data.data === "string") url = data.data;
    else if (data.data && typeof data.data === "object") {
      url = data.data.playUrl?.[mid];
    }
    if (!url) return null;
    return { url, format: "mp3" };
  }
  parseId(trackId) {
    if (trackId.startsWith("qq:")) return trackId.slice(3);
    return trackId || null;
  }
};
var index_default = QQMusicConnector;
export {
  QQMusicConnector,
  index_default as default
};
