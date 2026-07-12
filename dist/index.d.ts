import { MusicConnector, MusicConnectorMeta, MusicListQuery, MusicSearchResult, MusicTrack, MusicStreamInfo, MusicPlaylistQuery, MusicPlaylistList } from '@dancingmusic/music-connect';

/**
 * QQ Music connector for DancingMusic.
 *
 * QQ Music does not provide a general-purpose public catalog API. This
 * anonymous variant therefore targets the normalized gateway contract in this
 * repository's README. It never accepts or forwards account credentials.
 *
 * Track ID format: `qq:<songmid>` (QQ uses string songmid as the canonical id)
 */

interface QQMusicConfig {
    apiBaseUrl?: string;
}
declare class QQMusicConnector implements MusicConnector {
    readonly meta: MusicConnectorMeta;
    private baseUrl;
    init(config?: Record<string, unknown>): Promise<void>;
    search(query: MusicListQuery): Promise<MusicSearchResult>;
    getTrack(trackId: string): Promise<MusicTrack | null>;
    getStreamUrl(trackId: string): Promise<MusicStreamInfo | null>;
    listPlaylists(query?: MusicPlaylistQuery): Promise<MusicPlaylistList>;
    getPlaylistTracks(playlistId: string, opts?: {
        page?: number;
        pageSize?: number;
    }): Promise<MusicSearchResult>;
    private parseId;
    private parsePlaylistId;
    private request;
}

export { type QQMusicConfig, QQMusicConnector, QQMusicConnector as default };
