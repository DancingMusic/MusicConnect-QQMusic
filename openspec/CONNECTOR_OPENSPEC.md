# OpenSpec: QQ Music Anonymous Connector

- Spec-ID: `qq-music-anonymous-connector`
- Version: `1.0.0`
- Status: `Active`
- Last-Updated: `2026-08-01`

## Artwork

The connector MUST return QQ Music's real track and playlist artwork through
MusicConnect `coverUrl`. Album-mid artwork is built inside this implementation;
gateway playlist artwork is normalized to HTTPS, including protocol-relative
and QQ-relative values. It MUST NOT replace a valid provider cover with a host
default merely because a browser Canvas cannot load it directly.

The reviewed MusicStore manifest declares the exact expected artwork origins:

- `https://y.gtimg.cn`
- `https://y.qq.com`

These origins authorize the host artwork resolver only. They do not expand the
anonymous gateway Worker's network permission, and the connector does not pass
credentials in artwork URLs.

## Verification

Contract tests MUST verify the exact normalized QQ artwork URL for tracks and
playlists. Run `npm test` and `npm run build` before release.
