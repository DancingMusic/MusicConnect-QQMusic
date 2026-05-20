# @dancingmusic/music-connect-qqmusic

QQ Music connector for [DancingMusic](https://github.com/DancingMusic/DancingMusic).

QQ Music has no official open API. This connector targets a self-hosted instance of a community proxy project:

- [Rain120/qq-music-api](https://github.com/Rain120/qq-music-api) (Node, actively maintained)
- [jsososo/QQMusicApi](https://github.com/jsososo/QQMusicApi) (Node, archived but functional)

## Setup

1. Deploy a QQ Music API proxy (one of the above) and note the base URL, e.g. `https://qqmusic-api.your-domain.com`.
2. In DancingMusic: open the music store → connector switcher (top-right) → **添加连接器** → **GitHub** tab → paste:
   ```
   https://github.com/DancingMusic/MusicConnect-QQMusic
   ```
3. After it loads, click the gear icon next to the new connector and paste your API endpoint into the config field.

## Track ID format

`qq:<songmid>` (QQ uses a string `songmid` like `001fakp82WoZ8u` as the canonical id)

## API endpoints used

- `GET /search?key=...&pageNo=...&pageSize=...` — keyword search
- `GET /song?songmid=...` — track detail
- `GET /song/url?id=...` — stream URL

## Note on legal status

Same as the NetEase connector: QQ Music's catalog is licensed and most tracks require a paid VIP account. The connector returns playable URLs only for tracks the proxy can unlock (free + previews). For full-catalog access, deploy your own proxy with valid QQ cookies, or stay within free content.

## License

MIT
