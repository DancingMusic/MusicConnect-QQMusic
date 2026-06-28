/**
 * QQ Music connector for DancingMusic.
 *
 * QQ Music has no official open API. This connector targets a self-hosted
 * instance of one of the community proxy projects:
 *   - https://github.com/Rain120/qq-music-api  (Node)
 *   - https://github.com/jsososo/QQMusicApi    (Node, archived but still works)
 *
 * Users configure `apiBaseUrl` only when they need a custom data proxy. Login
 * itself uses QQ Music's official web page and can be handled by the
 * DancingMusic desktop login window. Tracks live behind QQ's DRM, so playable
 * URLs are only returned for free/preview tracks — exactly the same trade-off
 * as the NetEase connector.
 *
 * Track ID format: `qq:<songmid>` (QQ uses string songmid as the canonical id)
 */
import type {
  MusicConnector,
  MusicConnectorMeta,
  MusicListQuery,
  MusicSearchResult,
  MusicStreamInfo,
  MusicTrack,
  MusicPlaylist,
  MusicPlaylistList,
  MusicPlaylistQuery,
  MusicConnectorLoginRequest,
  MusicConnectorLoginResult,
} from "@dancingmusic/music-store";

export interface QQMusicConfig {
  apiBaseUrl?: string;
  authCookie?: string;
  authStartPath?: string;
  authPollPath?: string;
}

interface QQSong {
  songmid?: string;
  songname?: string;
  singer?: Array<{ name: string }>;
  albumname?: string;
  albummid?: string;
  interval?: number;     // seconds
}

interface QQSearchResponse {
  result?: number;
  data?: {
    list?: QQSong[];
    song?: { list?: QQSong[]; totalnum?: number };
    total?: number;
  };
}

interface QQSongUrlResponse {
  result?: number;
  data?: { playUrl?: { [mid: string]: string } } | string;
}

type AnyRecord = Record<string, unknown>;
const QQ_WEB_COOKIE_FLOW_ID = "qq-music-web-cookie";
const QQ_LOGIN_URL = "https://y.qq.com/n/ryqq/profile";
const QQ_WARMUP_URL = "https://y.qq.com/n/ryqq/player";
const QQ_COOKIE_PRIORITY = [
  "uin",
  "qqmusic_uin",
  "wxuin",
  "login_type",
  "qm_keyst",
  "qqmusic_key",
  "music_key",
  "p_skey",
  "skey",
  "psrf_qqopenid",
  "psrf_qqunionid",
  "psrf_qqaccess_token",
  "psrf_qqrefresh_token",
  "wxopenid",
  "wxunionid",
  "wxrefresh_token",
  "wxskey",
  "p_uin",
  "ptcz",
  "RK",
];

function joinSinger(s: QQSong): string {
  if (!s.singer) return "";
  return s.singer.map(x => x?.name).filter(Boolean).join(", ");
}

function albumCover(mid?: string): string | undefined {
  if (!mid) return undefined;
  return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg`;
}

function toTrack(s: QQSong): MusicTrack {
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
    updatedAt: "",
  };
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function normalizeImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^(?:https?:|data:image\/)/i.test(value)) return value;
  if (/^[a-z0-9+/=]+$/i.test(value) && value.length > 80) {
    return `data:image/png;base64,${value}`;
  }
  return value;
}

function parseCookieHeader(cookieText: string): Record<string, string> {
  const out: Record<string, string> = {};
  String(cookieText || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}

function qqCookieHasLogin(cookieText: string): boolean {
  const obj = parseCookieHeader(cookieText);
  const rawUin = Number(obj.login_type) === 2
    ? (obj.wxuin || obj.uin || obj.p_uin || "")
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || "");
  const uin = String(rawUin).replace(/\D/g, "");
  const musicKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey ||
    obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || "";
  return !!(uin && musicKey);
}

function qqCookieHasPlaybackLogin(cookieText: string): boolean {
  const obj = parseCookieHeader(cookieText);
  const rawUin = Number(obj.login_type) === 2
    ? (obj.wxuin || obj.uin || obj.p_uin || "")
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || "");
  const uin = String(rawUin).replace(/\D/g, "");
  const playbackKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || "";
  return !!(uin && playbackKey);
}

export class QQMusicConnector implements MusicConnector {
  readonly meta: MusicConnectorMeta = {
    id: "qq-music",
    name: "QQ 音乐",
    description: "QQ Music data source with official web login",
    version: "0.5.2",
    capabilities: ["search", "stream", "playlist", "login"],
    configSchema: [
      {
        key: "apiBaseUrl",
        label: "QQ Music API 端点",
        type: "url",
        required: false,
        placeholder: "https://your-qqmusic-api.example.com",
        help: "高级设置：自部署的 Rain120/qq-music-api 或 jsososo/QQMusicApi 实例。登录不需要配置此项；未配置时无法搜索 QQ 曲库。",
      },
      {
        key: "authCookie",
        label: "QQ 音乐登录 Cookie",
        type: "password",
        required: false,
        placeholder: "uin=...; qm_keyst=...",
        help: "官方网页登录后自动保存。普通用户不需要手动粘贴。",
      },
      {
        key: "authStartPath",
        label: "二维码创建路径",
        type: "text",
        required: false,
        placeholder: "/user/qr",
        default: "/user/qr",
        help: "不同 QQ 音乐代理的登录端点可能不同，可按自部署服务调整。",
      },
      {
        key: "authPollPath",
        label: "二维码轮询路径",
        type: "text",
        required: false,
        placeholder: "/user/qr/check",
        default: "/user/qr/check",
        help: "轮询端点需返回登录状态和 cookie。",
      },
    ],
  };

  private baseUrl: string = "";
  private authCookie = "";
  private authStartPath = "/user/qr";
  private authPollPath = "/user/qr/check";

  async init(config?: Record<string, unknown>): Promise<void> {
    const typed = config as QQMusicConfig | undefined;
    this.baseUrl = (typed?.apiBaseUrl || "").replace(/\/$/, "");
    this.authCookie = typed?.authCookie || "";
    this.authStartPath = typed?.authStartPath || "/user/qr";
    this.authPollPath = typed?.authPollPath || "/user/qr/check";
    if (!this.baseUrl) {
      console.warn(
        "[QQMusicConnector] apiBaseUrl not configured — QQ search will stay empty. " +
        "Login can still use the official web cookie flow.",
      );
    }
  }

  async login(request: MusicConnectorLoginRequest = { intent: "status" }): Promise<MusicConnectorLoginResult> {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      return this.authCookie
        ? { status: "authenticated", message: "QQ 音乐账号会话已配置" }
        : { status: "anonymous", message: "未登录 QQ 音乐" };
    }
    if (intent === "logout") {
      this.authCookie = "";
      return {
        status: "anonymous",
        message: "已退出 QQ 音乐账号",
        configPatch: { authCookie: "" },
      };
    }
    if (intent === "cancel") {
      return { status: "anonymous", message: "已取消 QQ 音乐登录" };
    }
    if (intent === "continue") {
      const capturedCookie = firstString(request.input?.cookie, request.input?.authCookie);
      if (capturedCookie) return this.acceptWebCookie(capturedCookie);
      if (request.flowId === QQ_WEB_COOKIE_FLOW_ID) return this.startWebLogin("请继续在 QQ 音乐官方登录窗口完成登录");
      if (!request.flowId) return { status: "error", message: "缺少 QQ 音乐登录 flowId" };
      if (!this.baseUrl) return this.startWebLogin("请重新打开 QQ 音乐官方登录窗口；二维码代理登录需要先配置 QQ Music API 端点。");
      return this.continueQrLogin(request.flowId);
    }
    return this.startWebLogin();
  }

  async search(query: MusicListQuery): Promise<MusicSearchResult> {
    const keyword = (query.keyword || "").trim();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (!keyword || !this.baseUrl) {
      return { tracks: [], total: 0, page, pageSize };
    }

    // Most QQMusicApi forks expose GET /search?key=...&pageNo=...&pageSize=...
    const data = await this.request<QQSearchResponse>("/search", {
      key: keyword,
      pageNo: page,
      pageSize,
    });

    // Two common response shapes from popular forks
    const list = data.data?.list ?? data.data?.song?.list ?? [];
    const total = data.data?.total ?? data.data?.song?.totalnum ?? list.length;

    return {
      tracks: list.map(toTrack),
      total,
      page,
      pageSize,
    };
  }

  async getTrack(trackId: string): Promise<MusicTrack | null> {
    const mid = this.parseId(trackId);
    if (!mid || !this.baseUrl) return null;
    const data = await this.request<{ data?: QQSong | QQSong[] }>("/song", { songmid: mid });
    const s = Array.isArray(data.data) ? data.data[0] : data.data;
    return s ? toTrack(s) : null;
  }

  async getStreamUrl(trackId: string): Promise<MusicStreamInfo | null> {
    const mid = this.parseId(trackId);
    if (!mid || !this.baseUrl) return null;
    const data = await this.request<QQSongUrlResponse>("/song/url", { id: mid });
    let url: string | undefined;
    if (typeof data.data === "string") url = data.data;
    else if (data.data && typeof data.data === "object") {
      url = data.data.playUrl?.[mid];
    }
    if (!url) return null;
    return { url, format: "mp3" };
  }

  async listPlaylists(query: MusicPlaylistQuery = {}): Promise<MusicPlaylistList> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (!this.baseUrl) return { playlists: [], total: 0, page, pageSize };
    // QQ's official endpoint takes a `sortId` query: 5 = hot (most played),
    // 2 = newest. Most proxy forks pass it through. Default = hot.
    const sortId = query.sort === "new" ? 2 : 5;
    const data = await this.request<{ data?: { list?: QQPlaylist[]; total?: number } }>("/top/playlist", {
      pageNo: page,
      pageSize,
      sortId,
      ...(query.category ? { categoryId: query.category } : {}),
    });
    const list = data.data?.list ?? [];
    return {
      playlists: list.map(toPlaylist),
      total: data.data?.total ?? list.length,
      page,
      pageSize,
    };
  }

  async getPlaylistTracks(
    playlistId: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<MusicSearchResult> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 30;
    const id = this.parsePlaylistId(playlistId);
    if (!id || !this.baseUrl) return { tracks: [], total: 0, page, pageSize };
    const data = await this.request<{ data?: { songlist?: QQSong[] } }>("/playlist", { id });
    const songs = data.data?.songlist ?? [];
    return {
      tracks: songs.map(toTrack),
      total: songs.length,
      page,
      pageSize,
    };
  }

  private async startQrLogin(): Promise<MusicConnectorLoginResult> {
    if (!this.baseUrl) throw new Error("请先配置 QQ Music API 端点");
    const body = await this.request<AnyRecord>(this.authStartPath);
    const data = asRecord(body.data);
    const flowId = firstString(
      data.key,
      data.unikey,
      data.loginId,
      data.qrKey,
      body.key,
      body.unikey,
      body.loginId,
      body.qrKey,
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
      body.url,
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
      body.img,
    ));
    if (!flowId && !qrUrl && !imageUrl) {
      throw new Error("QQ 音乐代理未返回二维码登录信息");
    }
    return {
      status: "pending",
      flow: "qr",
      flowId: flowId || qrUrl || imageUrl,
      actions: [{
        type: "qr",
        label: "QQ 音乐扫码登录",
        qrUrl,
        imageUrl,
        message: "使用 QQ 音乐 App 扫码确认",
      }],
      expiresAt: Date.now() + 2 * 60 * 1000,
      nextPollMs: 2500,
      message: "使用 QQ 音乐 App 扫码确认",
    };
  }

  private startWebLogin(message = "在 QQ 音乐官方页面完成登录后，DancingMusic 会自动保存当前账号会话。"): MusicConnectorLoginResult {
    return {
      status: "pending",
      flow: "browser",
      flowId: QQ_WEB_COOKIE_FLOW_ID,
      actions: [{
        type: "open-url",
        label: "打开 QQ 音乐官方登录窗口",
        url: QQ_LOGIN_URL,
        cookieCapture: {
          provider: "qq-music",
          title: "QQ 音乐登录",
          domains: ["qq.com", "y.qq.com", "qqmusic.qq.com"],
          requiredCookieNames: ["uin", "qqmusic_uin", "wxuin", "p_uin"],
          playbackCookieNames: ["qm_keyst", "qqmusic_key", "music_key", "wxskey"],
          cookieNames: QQ_COOKIE_PRIORITY,
          warmupUrl: QQ_WARMUP_URL,
          message: "桌面端会在播放器内打开 QQ 音乐官方登录页，并自动读取播放所需 cookie。",
        },
        message,
      }],
      message,
    };
  }

  private acceptWebCookie(cookie: string): MusicConnectorLoginResult {
    if (!qqCookieHasLogin(cookie)) {
      return { status: "error", message: "未读取到有效 QQ 音乐会话 cookie" };
    }
    this.authCookie = cookie;
    return {
      status: "authenticated",
      message: qqCookieHasPlaybackLogin(cookie)
        ? "QQ 音乐登录成功"
        : "QQ 音乐登录成功；如部分歌曲无法播放，请重新打开登录窗口补全播放 cookie",
      configPatch: { authCookie: cookie },
    };
  }

  private async continueQrLogin(flowId: string): Promise<MusicConnectorLoginResult> {
    if (!this.baseUrl) throw new Error("请先配置 QQ Music API 端点");
    const body = await this.request<AnyRecord>(this.authPollPath, { key: flowId, loginId: flowId });
    const data = asRecord(body.data);
    const code = Number(data.code ?? body.code ?? body.result ?? data.result);
    const status = String(data.status ?? body.status ?? data.message ?? body.message ?? "").toLowerCase();
    const cookie = firstString(
      data.cookie,
      data.authCookie,
      data.qqMusicCookie,
      body.cookie,
      body.authCookie,
      body.qqMusicCookie,
    );

    if (cookie || code === 803 || /success|authenticated|login/.test(status)) {
      this.authCookie = cookie || this.authCookie;
      return {
        status: "authenticated",
        user: {
          id: firstString(data.uin, data.id, body.uin, body.id),
          name: firstString(data.nickname, data.nick, data.name, body.nickname, body.nick, body.name),
          avatarUrl: firstString(data.avatarUrl, data.avatar, body.avatarUrl, body.avatar),
        },
        message: firstString(data.message, body.message) || "QQ 音乐登录成功",
        configPatch: this.authCookie ? { authCookie: this.authCookie } : undefined,
      };
    }
    if (code === 800 || code === 408 || /expire|timeout/.test(status)) {
      return { status: "expired", message: firstString(data.message, body.message) || "二维码已过期" };
    }
    if (code === 801 || code === 802 || /wait|scan|confirm|pending/.test(status)) {
      return {
        status: "pending",
        flow: "qr",
        flowId,
        message: firstString(data.message, body.message) || "等待扫码确认",
        nextPollMs: 2500,
      };
    }
    return {
      status: "error",
      message: firstString(data.message, body.message) || `QQ 音乐登录状态异常: ${Number.isFinite(code) ? code : "unknown"}`,
    };
  }

  private parseId(trackId: string): string | null {
    if (trackId.startsWith("qq:")) return trackId.slice(3);
    return trackId || null;
  }

  private parsePlaylistId(id: string): string | null {
    if (id.startsWith("qq-playlist:")) return id.slice("qq-playlist:".length);
    return id || null;
  }

  private async request<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
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
    return res.json() as Promise<T>;
  }
}

interface QQPlaylist {
  dissid?: string | number;
  disstid?: string | number;
  dissname?: string;
  imgurl?: string;
  song_count?: number;
  song_num?: number;
  creator?: { name?: string };
  introduction?: string;
}

function toPlaylist(p: QQPlaylist): MusicPlaylist {
  const id = String(p.dissid ?? p.disstid ?? "");
  return {
    id: `qq-playlist:${id}`,
    name: p.dissname || "Unknown",
    description: p.introduction,
    coverUrl: p.imgurl,
    trackCount: p.song_count ?? p.song_num,
    curator: p.creator?.name,
    externalUrl: id ? `https://y.qq.com/n/ryqq/playlist/${id}` : undefined,
  };
}

export default QQMusicConnector;
