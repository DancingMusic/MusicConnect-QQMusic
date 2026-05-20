/**
 * QQ Music connector for DancingMusic.
 *
 * QQ Music has no official open API. This connector targets a self-hosted
 * instance of one of the community proxy projects:
 *   - https://github.com/Rain120/qq-music-api  (Node)
 *   - https://github.com/jsososo/QQMusicApi    (Node, archived but still works)
 *
 * Users configure `apiBaseUrl` in the connector switcher to point at their
 * deployed instance. Tracks live behind QQ's DRM, so playable URLs are only
 * returned for free/preview tracks — exactly the same trade-off as the
 * NetEase connector.
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
} from "@dancingmusic/music-store";

export interface QQMusicConfig {
  apiBaseUrl?: string;
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
    description: "QQ Music data source (via self-hosted proxy API)",
    version: "0.2.0",
    capabilities: ["search", "stream", "playlist"],
    configSchema: [
      {
        key: "apiBaseUrl",
        label: "QQ Music API 端点",
        type: "url",
        required: true,
        placeholder: "https://your-qqmusic-api.example.com",
        help: "自部署的 Rain120/qq-music-api 或 jsososo/QQMusicApi 实例。QQ 没有官方开放 API，无代理则无法搜索。",
      },
    ],
  };

  private baseUrl: string = "";

  async init(config?: Record<string, unknown>): Promise<void> {
    const typed = config as QQMusicConfig | undefined;
    this.baseUrl = (typed?.apiBaseUrl || "").replace(/\/$/, "");
    if (!this.baseUrl) {
      console.warn(
        "[QQMusicConnector] apiBaseUrl not configured — search will fail. " +
        "Deploy https://github.com/Rain120/qq-music-api or similar.",
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
    const url = `${this.baseUrl}/search?key=${encodeURIComponent(keyword)}&pageNo=${page}&pageSize=${pageSize}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`QQ Music search failed: ${res.status}`);
    const data = (await res.json()) as QQSearchResponse;

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
    const res = await fetch(`${this.baseUrl}/song?songmid=${encodeURIComponent(mid)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: QQSong | QQSong[] };
    const s = Array.isArray(data.data) ? data.data[0] : data.data;
    return s ? toTrack(s) : null;
  }

  async getStreamUrl(trackId: string): Promise<MusicStreamInfo | null> {
    const mid = this.parseId(trackId);
    if (!mid || !this.baseUrl) return null;
    const res = await fetch(`${this.baseUrl}/song/url?id=${encodeURIComponent(mid)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as QQSongUrlResponse;
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
    const url = `${this.baseUrl}/top/playlist?pageNo=${page}&pageSize=${pageSize}&sortId=${sortId}` +
      (query.category ? `&categoryId=${encodeURIComponent(query.category)}` : "");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`QQ playlist fetch failed: ${res.status}`);
    const data = (await res.json()) as { data?: { list?: QQPlaylist[]; total?: number } };
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
    const res = await fetch(`${this.baseUrl}/playlist?id=${encodeURIComponent(id)}`);
    if (!res.ok) return { tracks: [], total: 0, page, pageSize };
    const data = (await res.json()) as { data?: { songlist?: QQSong[] } };
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
