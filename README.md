# WorkBuddy Skin Kit

给 WorkBuddy 桌面版换主题的工具包。**不修改安装包**——通过本机回环 CDP 在运行时注入主题，WorkBuddy 升级后无需重新适配；并附带静默启动器，让皮肤在每次启动时自动恢复。

> 非腾讯官方项目。
> 内置主题的视觉素材版权归各自权利人所有，仅供学习与个人使用，请勿用于商业分发或再授权。

---

## 它解决什么问题

WorkBuddy 官方只提供「浅色 / 深色」两档，没有自定义外观，这跟账号类型无关，是产品设计如此。本工具包用 CDP（Chrome DevTools Protocol）在运行时把主题注入渲染进程，因此：

- **零侵入**：官方安装包、`app.asar`、应用签名都不动，卸载就是不再运行
- **升级无痛**：WorkBuddy 更新后直接覆盖安装即可，不需要为每个版本重新适配
- **即点即换**：注入后右上角出现 🎨 面板，已装主题一键切换

## 能力

| 能力 | 说明 |
|---|---|
| 一张图一个主题 | 任意 PNG / JPEG / WebP 生成皮肤（配色 + 背景底图），🎨 面板里也能直接上传 |
| 10 个内置主题 | 动漫 / 深色护眼等类别，见 `studio/themes/` |
| 深浅色联动 | 主题的 `surface` 明度决定 WorkBuddy 切深色还是浅色模式，VS Code 原生控件跟随 |
| 持久化启动 | `tools/wb-skin-boot.mjs` 静默启动器：开机或启动时自动重新注入，全程无黑窗 |
| 竖图适配 | `tools/build_skin_hero.py` 把手机壁纸 / 竖版海报重构成横版背景，避免 logo 被裁 |
| 安全回退 | 主题包路径逃逸、符号链接、非 HEX 颜色都会被 schema 拒绝；`pause` 一键恢复原生界面 |

## 快速开始

前置：Windows + 已安装 WorkBuddy 桌面版 + Node.js 22 或更高。

```bash
git clone https://github.com/Ryan-7962/workbuddy-skin-kit.git
cd workbuddy-skin-kit
```

### 1. 一次性注入（会弹一个控制台窗口，过程可见）

```bash
node tools/generate-launcher.mjs --theme-id miku-light
```

它会在桌面创建「WorkBuddy皮肤启动」文件夹，里面有 `启动WorkBuddy-注入皮肤.cmd`。
**完全退出 WorkBuddy**，然后双击那个 cmd。看到 `SUCCESS: Theme injected!` 即成功，
右上角 🎨 按钮可以按住拖动到任意位置。

### 2. 持久化（让皮肤在每次启动时自动恢复）

一次性注入是运行时行为，WorkBuddy 一重启就没了。持久化的本质是**让 WorkBuddy 的启动入口自动带上调试端口**：

```bash
node tools/wb-skin-boot.mjs install   # 生成静默启动器 + 桌面快捷方式「WorkBuddy（带皮肤）」
node tools/wb-skin-boot.mjs enable    # 可选：装入「启动」文件夹，开机自动带皮肤
node tools/wb-skin-boot.mjs status    # 查看接线状态
```

- 以后点桌面「WorkBuddy（带皮肤）」即可，无黑窗
- 默认主题写在 `%LOCALAPPDATA%\WorkBuddySkinStudio\default-theme.txt`，改它即可换
- 日志在 `%LOCALAPPDATA%\WorkBuddySkinStudio\boot.log`
- 幂等：若 WorkBuddy 已经是带调试端口的实例，只重新注入，不会重启
- 不想要开机自启就 `node tools/wb-skin-boot.mjs disable`

> 为什么必须接管启动入口？因为 CDP 端口只在 WorkBuddy 带 `--remote-debugging-port` 启动时才存在，
> 普通双击启动的实例根本没有这个通道，任何后台程序都注入不进去。

## 做自己的主题

### 方式一：直接上传

注入后点右上角 🎨 → 「＋ 自定义图片」，选本地图片，会自动按图片风格取色。

### 方式二：命令行

```bash
node studio/src/cli.mjs create --image poster.jpg --name my-theme
```

注意 `--name` 会经 slugify 变成 id（只保留 `[a-z0-9]` 与连字符），所以用英文或拼音；
中文显示名在 create 之后改 `theme.json` 的 `name` 字段。

**`create` 不做自动取色**，会写入固定默认配色，品牌向主题需手动改 `theme.json`。

### 方式三：竖版图专用流程

手机壁纸、竖版海报直接当背景会被 `cover` 裁掉大半（竖图在 16:9 窗口下只剩中间约 43%，logo 必丢）。先用脚本重构：

```bash
python tools/build_skin_hero.py --image poster.jpg \
    --surface "#F3FBF5" \
    --theme-id my-theme --theme-name "我的主题" --accent "#049647" \
    --themes-dir "$LOCALAPPDATA/WorkBuddySkinStudio/themes"
```

`--themes-dir` 指向 studio 实际读取的用户主题目录（Windows 默认 `%LOCALAPPDATA%\WorkBuddySkinStudio\themes`）；给了它就会同时产出 `hero.jpg` 和 `theme.json`。

它输出 2560×1440 横版背景：左侧用面板底色填充（正好落在 WorkBuddy 内容区），右侧原图完整保留，接缝处 alpha 淡出。加 `--config skins.json` 可批量。

### 主题目录规范

```
<themes-dir>/<theme-id>/
  theme.json     # schemaVersion=1，colors 四项必须 6 位 HEX，id 仅小写字母数字连字符
  hero.jpg       # 或 hero.webp / hero.png
```

## 目录结构

```
studio/                  上游 cdredfox/workbuddy-skin-studio 的代码与主题库（MIT）
  src/                   主题管理、CDP 客户端、CSS 生成、渲染进程运行时
  themes/                10 个内置主题
  scripts/               安装 / 恢复 / 预览脚本（含 macOS 的 .command）
tools/
  wb-skin-boot.mjs       静默启动器（持久化，Windows）
  generate-launcher.mjs  生成 cmd + vbs 启动器（一次性注入，Windows）
  build_skin_hero.py     竖图 → 横版背景构建器（跨平台）
SKILL.md                 给 AI 助手用的自动化流程说明
```

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 关掉 cmd 窗口 WorkBuddy 也退了 | 绕过 vbs 直接 start 启动 | 确认 cmd 里用的是 `wscript //nologo "%~dp0wb-launch.vbs"` |
| cmd 报 `'ho'/'cho' 不是命令` | 批处理被写成了 LF 换行 | 用 `generate-launcher.mjs` 重新生成（内置 CRLF 自检） |
| `[3/4]` 等待超时 | WorkBuddy 没以调试模式起来 | 先完全退出旧进程再双击；确认 9223 端口没被占用 |
| 重启后皮肤没了 | 运行时注入的正常表现 | 用 `wb-skin-boot.mjs` 做持久化 |
| 深色图配出了浅色底 | 自动取色按平均亮度判断会误判 | 手动改 `theme.json` 的 `surface` |
| 主题不显示在 🎨 菜单 | theme.json 不合法会被静默跳过 | 用 `node studio/src/cli.mjs list` 核对，或直接调 `loadTheme` 看报错 |

## 版权与免责

- 本项目与腾讯无关，不是 WorkBuddy 官方功能。
- **本项目不包含任何第三方品牌素材、代言人肖像或商业 IP 图片。** 使用者自行导入的素材，其版权与肖像权责任由使用者自负。
- 通过本工具修改的是**你自己机器上的运行时外观**，不涉及破解、不绕过任何授权校验。
- 内置主题中的名称与风格仅为技术演示，如涉及第三方权利请自行替换。

## Attribution

`studio/` 目录来自 [cdredfox/workbuddy-skin-studio](https://github.com/cdredfox/workbuddy-skin-studio)（MIT License，Copyright © 2026 cdredfox），
在其基础上增加了 Windows 静默启动器与竖版图背景构建器。原始许可全文见 `studio/LICENSE`。

## License

MIT，见 [LICENSE](LICENSE)。
