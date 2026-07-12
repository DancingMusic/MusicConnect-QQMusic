/**
 * QQ Music connector for DancingMusic.
 *
 * QQ Music does not provide a general-purpose public catalog API. This
 * anonymous variant therefore targets the normalized gateway contract in this
 * repository's README. It never accepts or forwards account credentials.
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
} from "@dancingmusic/music-connect";

export interface QQMusicConfig {
  apiBaseUrl?: string;
}

function validateBaseUrl(value: string): string {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("QQ 音乐网关必须使用 HTTPS；本地开发仅允许 loopback HTTP");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("QQ 音乐网关地址不能包含内嵌凭据、查询参数或片段");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
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

export class QQMusicConnector implements MusicConnector {
  readonly meta: MusicConnectorMeta = {
    id: "qq-music",
    name: "QQ 音乐",
    description: "Anonymous QQ Music catalog through a compatible self-hosted gateway",
    familyId: "qq-music",
    variant: "anonymous",
    authRequirement: "none",
    supportedHosts: ["web", "desktop"],
    version: "0.5.4",
    capabilities: ["search", "stream", "playlist"],
    configSchema: [
      {
        key: "apiBaseUrl",
        label: "QQ Music API 端点",
        type: "url",
        required: false,
        placeholder: "https://your-qqmusic-api.example.com",
        help: "需要兼容本仓库文档所列路由的自部署 HTTPS 网关。未配置时不会伪装为可搜索或可播放。",
      },
    ],
  };

  private baseUrl: string = "";

  async init(config?: Record<string, unknown>): Promise<void> {
    const typed = config as QQMusicConfig | undefined;
    const configuredUrl = (typed?.apiBaseUrl || "").trim();
    this.baseUrl = configuredUrl ? validateBaseUrl(configuredUrl) : "";
    if (!this.baseUrl) {
      console.warn(
        "[QQMusicConnector] apiBaseUrl not configured — QQ search will stay empty. " +
        "Configure a compatible HTTPS catalog gateway before searching.",
      );
    }
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
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
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
