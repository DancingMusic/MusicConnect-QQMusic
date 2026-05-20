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
    version: "0.1.0",
    capabilities: ["search", "stream"],
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

  private parseId(trackId: string): string | null {
    if (trackId.startsWith("qq:")) return trackId.slice(3);
    return trackId || null;
  }
}

export default QQMusicConnector;
