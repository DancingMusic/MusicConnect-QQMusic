# @dancingmusic/music-connect-qqmusic

QQ Music connector for [DancingMusic](https://github.com/DancingMusic/DancingMusic).

🔗 **Live demo:** [https://dancingmusic.github.io/MusicConnect-QQMusic/](https://dancingmusic.github.io/MusicConnect-QQMusic/) — search + play table built from this connector's own `dist/index.js`.

QQ Music has no official open API. Account login uses the official QQ Music web page in the DancingMusic desktop login window and saves the returned cookie automatically. Search/playback data still needs a QQ Music API-compatible proxy when you want QQ catalog browsing:

- [Rain120/qq-music-api](https://github.com/Rain120/qq-music-api) (Node, actively maintained)
- [jsososo/QQMusicApi](https://github.com/jsososo/QQMusicApi) (Node, archived but functional)

## Setup

1. In DancingMusic: open the music store → connector switcher (top-right) → **添加连接器** → **GitHub** tab → paste:
   ```
   https://github.com/DancingMusic/MusicConnect-QQMusic
   ```
2. Click **登录** and finish login in the official QQ Music page shown inside DancingMusic.
3. Advanced only: deploy a QQ Music API proxy and paste its base URL into **高级设置** if you need QQ catalog search/playback.

Optional login config fields:

- `authCookie` — QQ Music cookie, saved automatically after official web login.
- `apiBaseUrl` — advanced data proxy base URL.
- `authStartPath` — legacy proxy QR creation endpoint path. Defaults to `/user/qr`.
- `authPollPath` — legacy proxy QR polling endpoint path. Defaults to `/user/qr/check`.

## Track ID format

`qq:<songmid>` (QQ uses a string `songmid` like `001fakp82WoZ8u` as the canonical id)

## API endpoints used

- `GET /search?key=...&pageNo=...&pageSize=...` — keyword search
- `GET /song?songmid=...` — track detail
- `GET /song/url?id=...` — stream URL
- Official web login at `https://y.qq.com/n/ryqq/profile` — desktop cookie capture
- `GET /user/qr` / `GET /user/qr/check?key=...` — legacy proxy QR fallback (configurable)

## Note on legal status

Same as the NetEase connector: QQ Music's catalog is licensed and most tracks require a paid VIP account. The connector returns playable URLs only for tracks the proxy can unlock (free + previews). For full-catalog access, use your own valid account session and stay within the platform's terms.

## License

MIT

## Versioned releases

This repo uses an auto-release workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)) that creates a `v<package.json version>` tag + GitHub Release on every push to `main` whose version field has changed. Each release attaches the freshly-built `dist/index.js`.

**Pin to a specific version** (recommended for production):
```
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-QQMusic@v0.5.2/dist/index.js
```

**Always-latest** (handy for dev, but jsdelivr caches `@main` for up to a week):
```
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-QQMusic@main/dist/index.js
```

### Releasing a new version

1. Edit code under `src/`
2. `npm version patch` (or `minor` / `major`) — bumps `package.json`
3. `npm run build` — refreshes `dist/index.js`
4. Commit (including `dist/`) + push to `main`
5. The workflow detects the new version, creates the tag, and publishes the GitHub Release automatically
