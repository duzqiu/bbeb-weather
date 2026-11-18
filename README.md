# 灞波儿奔天气（多端应用）

基于**微信多端框架（Donut v2）**的项目：一套小程序代码，同时构建

- 微信小程序
- Android App
- iOS App

当前为**空白骨架**，只有「天气 / 我的」两个页面，业务从 `miniprogram/pages/index/` 开始写。

## 目录结构

```
├── miniprogram/            小程序源码（多端共用）
│   ├── app.ts              App 入口
│   ├── app.json            页面与窗口配置
│   ├── app.wxss            全局样式
│   ├── images/tabbar/      底部菜单图标（天气 / 我的，含选中态）
│   └── pages/
│       ├── index/          天气页（首页 · tabBar）
│       └── mine/           我的页（tabBar）
├── miniapp/
│   ├── android/            Android 宿主资源
│   │   ├── icons/          应用图标（hdpi / xhdpi / xxhdpi / xxxhdpi）
│   │   ├── splash/         启动图
│   │   └── nativeResources/ 原生自定义资源（默认空）
│   └── ios/                iOS 宿主资源
│       ├── icons/          9 个尺寸，含 1024 App Store 图标
│       └── splash.png      启动图
├── i18n/base.json          App 显示名称（多语言）
├── project.miniapp.json    多端打包配置：SDK 版本、图标、启动图、隐私、vConsole
├── project.config.json     小程序侧工程配置（projectArchitecture = multiPlatform）
├── typings/                内置 wx API 类型声明
└── tools/gen_assets.py     占位图标/启动图生成脚本（纯标准库，可改配色后重跑）
```

## 本地运行

1. 微信开发者工具打开本目录，AppID 为 `wx9d63b17ae217b656`；
2. 模拟器直接预览小程序效果；
3. 切到「多端」面板可编译 Android / iOS 版本。

## 调试与预览

- **Android**：工具栏「设备选择框」选「Android 移动应用助手」→ 运行 → 扫码。助手**只有 Android 版**（APK），在 [移动应用助手更新日志](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/miniapp/changelog/assistant/changelog.html) 下载。
- **iOS**：没有对应的助手 App，只能用 USB 连接真机运行（Windows 需装 iTunes + iCloud，iOS 需开「开发者模式」）。首次运行按提示配置签名：
  - 临时签名：填普通 Apple ID 即可，不需要付费开发者账号，**7 天过期**；
  - 证书签名：`.p12` + `.mobileprovision`，需 Apple 开发者账号。
- **iOS 模拟器**：需要 Mac。
- **打包 APK / IPA**：见官方「打包生成 APK 和 AAB」「打包生成 IPA」文档。

## 定位到区县（需要三步配置）

天气页默认通过 `wx.getLocation` + 腾讯位置服务逆地理编码，把地点精确到「城市 · 区县」：

1. 在 [miniprogram/config.ts](miniprogram/config.ts) 填入腾讯位置服务 Key（[免费申请](https://lbs.qq.com/dev/console/key/manage)，需勾选 WebServiceAPI）；
2. 小程序后台把 `https://apis.map.qq.com` 加入 **request 合法域名**；
3. 小程序后台「开发管理 → 接口设置」申请 **wx.getLocation** 接口权限，并在《用户隐私保护指引》声明「位置信息」。

`app.json` 已声明 `requiredPrivateInfos: ["getLocation", "chooseLocation"]` 与 `scope.userLocation` 用途说明。

**没配 Key 也能用**：点击顶部地点即可通过 `wx.chooseLocation` 手动选点，区县从返回地址里解析。定位失败（拒绝授权、App 端未开位置服务）时同样会引导到手动选点。

图标和启动图是脚本生成的**占位图**，替换为设计稿时保持文件名和尺寸不变即可；改了配色可改 `tools/gen_assets.py` 顶部常量后重跑：

```
python3 tools/gen_assets.py
```

## 和风天气（JWT 本地签名）

天气数据来自和风天气，使用 Ed25519 签名的 JWT，签名在客户端完成：

```
seed(32B) -> secretKey -> sign -> JWT -> Authorization: Bearer -> devapi.qweather.com
```

| 文件 | 作用 |
|---|---|
| `miniprogram/config.ts` | kid / projectId / seedBase64 / host |
| `miniprogram/libs/nacl.min.js` | tweetnacl（已移除 crypto 依赖，小程序可直接用） |
| `miniprogram/libs/jwt.ts` | 拼 JWT、签名、15 分钟缓存 |
| `miniprogram/services/weather.ts` | 聚合实况 / 24 小时 / 7 天 / 空气质量 / 生活指数 |
| `keys/` | 原始密钥对（已 gitignore，不进小程序包） |

**必须配置域名**：小程序后台 → request 合法域名加 `https://devapi.qweather.com`
（若控制台显示的 API Host 是 `api.qweather.com`，把 config.ts 里的 host 一起改）。

**注意**：私钥 seed 会随小程序包分发，此方式仅适合自用项目；对外发布应改为服务端签发 JWT。

## 上线前必须处理

- [ ] 替换占位图标与启动图（尤其 `appStore1024`，App Store 要求不透明、无圆角）
- [ ] `project.miniapp.json` 中两端 `privacy.enable` 改为 `true`，并配置隐私协议
- [ ] 两端 `enableVConsole` 改为 `close`，避免线上暴露调试面板
- [ ] 配置签名：Android keystore、iOS 证书与描述文件
- [ ] 若需鸿蒙，补回 `mini-ohos` 配置与 `miniapp/ohos/` 目录
- [ ] App 端如需微信登录：先在 Donut 平台（多端专属空间 → 身份管理）开通，再在 `miniprogram/app.miniapp.json` 加回
      `"identityServiceConfig": { "authorizeMiniprogramType": 1, "miniprogramLoginPath": "__default__", "adaptWxLogin": true }`，
      否则上传构建会报 `-80108 未开通身份管理功能`
