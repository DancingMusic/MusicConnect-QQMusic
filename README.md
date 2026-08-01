# MusicConnect-QQMusic

QQ 音乐的 DancingMusic **匿名连接器实现**。

- 实现 ID：`qq-music`
- 家族 ID：`qq-music`
- 变体：`anonymous`
- 登录要求：`none`
- 能力：搜索、歌曲信息、可用时的播放地址、歌单
- 主机：Web、Desktop

QQ 音乐没有面向普通第三方应用的通用公共目录 REST API。v0.5.3 起，本仓库只连接用户信任并自行维护的 HTTPS 网关，不再声称直接兼容路由不同的社区项目，也不包含登录、扫码或 Cookie 采集逻辑。

```json
{
  "apiBaseUrl": "https://your-qqmusic-gateway.example.com"
}
```

未配置网关时，连接器会返回空目录，不会悄悄切换到公共代理。

## 稳定网关契约

- `GET /search?key=...&pageNo=...&pageSize=...`
- `GET /song?songmid=...`
- `GET /song/url?id=...`
- `GET /top/playlist?pageNo=...&pageSize=...&sortId=...`
- `GET /playlist?id=...`

网关可自行适配社区项目，例如 [Rain120/qq-music-api](https://github.com/Rain120/qq-music-api) 或 [jsososo/QQMusicApi](https://github.com/jsososo/QQMusicApi)，但连接器不复制其代码、许可证或不稳定路由。播放地址受版权、地区、会员状态和网关能力限制，允许返回空值。

## 封面边界

歌曲和歌单返回 QQ 音乐真实 `coverUrl`，协议相对地址、HTTP 地址和 QQ 站内相对地址
由连接器统一规范为 HTTPS。MusicStore 清单单独审核 `https://y.gtimg.cn` 与
`https://y.qq.com` 两个封面 origin，供宿主生成 Canvas/WebGL 可用的最终封面；这不会
扩大连接器网关权限，宿主和 Dancing 插件也不拼接 QQ 专有地址。

## 账号版边界

账号登录、收藏和会员能力以后使用独立仓库及实现 ID（建议 `qq-music-account`）。账号版必须经主仓凭据代理，不把 Cookie/Token 放进连接器配置或第三方网关 URL。

## 开发与发布

```bash
npm install
npm test
npm run build
```

```text
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-QQMusic@v0.5.5/dist/index.js
```

统一文档：[DancingMusic Docs](https://dancingmusic.github.io/docs/)
