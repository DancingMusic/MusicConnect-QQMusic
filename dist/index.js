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
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return void 0;
}
function normalizeImageUrl(value) {
  if (!value) return void 0;
  if (/^(?:https?:|data:image\/)/i.test(value)) return value;
  if (/^[a-z0-9+/=]+$/i.test(value) && value.length > 80) {
    return `data:image/png;base64,${value}`;
  }
  return value;
}
var QQMusicConnector = class {
  constructor() {
    this.meta = {
      id: "qq-music",
      name: "QQ \u97F3\u4E50",
      description: "QQ Music data source with proxy QR login",
      version: "0.4.0",
      capabilities: ["search", "stream", "playlist", "login"],
      configSchema: [
        {
          key: "apiBaseUrl",
          label: "QQ Music API \u7AEF\u70B9",
          type: "url",
          required: true,
          placeholder: "https://your-qqmusic-api.example.com",
          help: "\u81EA\u90E8\u7F72\u7684 Rain120/qq-music-api \u6216 jsososo/QQMusicApi \u5B9E\u4F8B\u3002QQ \u6CA1\u6709\u5B98\u65B9\u5F00\u653E API\uFF0C\u65E0\u4EE3\u7406\u5219\u65E0\u6CD5\u641C\u7D22\u3002"
        },
        {
          key: "authCookie",
          label: "QQ \u97F3\u4E50\u767B\u5F55 Cookie",
          type: "password",
          required: false,
          placeholder: "uin=...; qm_keyst=...",
          help: "\u626B\u7801\u767B\u5F55\u540E\u81EA\u52A8\u4FDD\u5B58\u3002\u4E5F\u53EF\u4EE5\u7C98\u8D34\u4EE3\u7406\u517C\u5BB9 cookie\u3002"
        },
        {
          key: "authStartPath",
          label: "\u4E8C\u7EF4\u7801\u521B\u5EFA\u8DEF\u5F84",
          type: "text",
          required: false,
          placeholder: "/user/qr",
          default: "/user/qr",
          help: "\u4E0D\u540C QQ \u97F3\u4E50\u4EE3\u7406\u7684\u767B\u5F55\u7AEF\u70B9\u53EF\u80FD\u4E0D\u540C\uFF0C\u53EF\u6309\u81EA\u90E8\u7F72\u670D\u52A1\u8C03\u6574\u3002"
        },
        {
          key: "authPollPath",
          label: "\u4E8C\u7EF4\u7801\u8F6E\u8BE2\u8DEF\u5F84",
          type: "text",
          required: false,
          placeholder: "/user/qr/check",
          default: "/user/qr/check",
          help: "\u8F6E\u8BE2\u7AEF\u70B9\u9700\u8FD4\u56DE\u767B\u5F55\u72B6\u6001\u548C cookie\u3002"
        }
      ]
    };
    this.baseUrl = "";
    this.authCookie = "";
    this.authStartPath = "/user/qr";
    this.authPollPath = "/user/qr/check";
  }
  async init(config) {
    const typed = config;
    this.baseUrl = (typed?.apiBaseUrl || "").replace(/\/$/, "");
    this.authCookie = typed?.authCookie || "";
    this.authStartPath = typed?.authStartPath || "/user/qr";
    this.authPollPath = typed?.authPollPath || "/user/qr/check";
    if (!this.baseUrl) {
      console.warn(
        "[QQMusicConnector] apiBaseUrl not configured \u2014 search will fail. Deploy https://github.com/Rain120/qq-music-api or similar."
      );
    }
  }
  async login(request = { intent: "status" }) {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      return this.authCookie ? { status: "authenticated", message: "QQ \u97F3\u4E50\u8D26\u53F7\u4F1A\u8BDD\u5DF2\u914D\u7F6E" } : { status: "anonymous", message: "\u672A\u767B\u5F55 QQ \u97F3\u4E50" };
    }
    if (intent === "logout") {
      this.authCookie = "";
      return {
        status: "anonymous",
        message: "\u5DF2\u9000\u51FA QQ \u97F3\u4E50\u8D26\u53F7",
        configPatch: { authCookie: "" }
      };
    }
    if (intent === "cancel") {
      return { status: "anonymous", message: "\u5DF2\u53D6\u6D88 QQ \u97F3\u4E50\u767B\u5F55" };
    }
    if (intent === "continue") {
      if (!request.flowId) return { status: "error", message: "\u7F3A\u5C11 QQ \u97F3\u4E50\u767B\u5F55 flowId" };
      return this.continueQrLogin(request.flowId);
    }
    return this.startQrLogin();
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
  async startQrLogin() {
    if (!this.baseUrl) throw new Error("\u8BF7\u5148\u914D\u7F6E QQ Music API \u7AEF\u70B9");
    const body = await this.request(this.authStartPath);
    const data = asRecord(body.data);
    const flowId = firstString(
      data.key,
      data.unikey,
      data.loginId,
      data.qrKey,
      body.key,
      body.unikey,
      body.loginId,
      body.qrKey
    );
    const qrUrl = firstString(
      data.qrurl,
      data.qrUrl,
      data.qrCode,
      data.qrcode,
      data.url,
      body.qrurl,
      body.qrUrl,
      body.qrCode,
      body.qrcode,
      body.url
    );
    const imageUrl = normalizeImageUrl(firstString(
      data.qrimg,
      data.qrImg,
      data.imageUrl,
      data.image,
      data.img,
      body.qrimg,
      body.qrImg,
      body.imageUrl,
      body.image,
      body.img
    ));
    if (!flowId && !qrUrl && !imageUrl) {
      throw new Error("QQ \u97F3\u4E50\u4EE3\u7406\u672A\u8FD4\u56DE\u4E8C\u7EF4\u7801\u767B\u5F55\u4FE1\u606F");
    }
    return {
      status: "pending",
      flow: "qr",
      flowId: flowId || qrUrl || imageUrl,
      actions: [{
        type: "qr",
        label: "QQ \u97F3\u4E50\u626B\u7801\u767B\u5F55",
        qrUrl,
        imageUrl,
        message: "\u4F7F\u7528 QQ \u97F3\u4E50 App \u626B\u7801\u786E\u8BA4"
      }],
      expiresAt: Date.now() + 2 * 60 * 1e3,
      nextPollMs: 2500,
      message: "\u4F7F\u7528 QQ \u97F3\u4E50 App \u626B\u7801\u786E\u8BA4"
    };
  }
  async continueQrLogin(flowId) {
    if (!this.baseUrl) throw new Error("\u8BF7\u5148\u914D\u7F6E QQ Music API \u7AEF\u70B9");
    const body = await this.request(this.authPollPath, { key: flowId, loginId: flowId });
    const data = asRecord(body.data);
    const code = Number(data.code ?? body.code ?? body.result ?? data.result);
    const status = String(data.status ?? body.status ?? data.message ?? body.message ?? "").toLowerCase();
    const cookie = firstString(
      data.cookie,
      data.authCookie,
      data.qqMusicCookie,
      body.cookie,
      body.authCookie,
      body.qqMusicCookie
    );
    if (cookie || code === 803 || /success|authenticated|login/.test(status)) {
      this.authCookie = cookie || this.authCookie;
      return {
        status: "authenticated",
        user: {
          id: firstString(data.uin, data.id, body.uin, body.id),
          name: firstString(data.nickname, data.nick, data.name, body.nickname, body.nick, body.name),
          avatarUrl: firstString(data.avatarUrl, data.avatar, body.avatarUrl, body.avatar)
        },
        message: firstString(data.message, body.message) || "QQ \u97F3\u4E50\u767B\u5F55\u6210\u529F",
        configPatch: this.authCookie ? { authCookie: this.authCookie } : void 0
      };
    }
    if (code === 800 || code === 408 || /expire|timeout/.test(status)) {
      return { status: "expired", message: firstString(data.message, body.message) || "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F" };
    }
    if (code === 801 || code === 802 || /wait|scan|confirm|pending/.test(status)) {
      return {
        status: "pending",
        flow: "qr",
        flowId,
        message: firstString(data.message, body.message) || "\u7B49\u5F85\u626B\u7801\u786E\u8BA4",
        nextPollMs: 2500
      };
    }
    return {
      status: "error",
      message: firstString(data.message, body.message) || `QQ \u97F3\u4E50\u767B\u5F55\u72B6\u6001\u5F02\u5E38: ${Number.isFinite(code) ? code : "unknown"}`
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
    if (this.authCookie && !url.searchParams.has("cookie")) {
      url.searchParams.set("cookie", this.authCookie);
    }
    const res = await fetch(url.toString());
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
    coverUrl: p.imgurl,
    trackCount: p.song_count ?? p.song_num,
    curator: p.creator?.name,
    externalUrl: id ? `https://y.qq.com/n/ryqq/playlist/${id}` : void 0
  };
}
var index_default = QQMusicConnector;
export {
  QQMusicConnector,
  index_default as default
};
