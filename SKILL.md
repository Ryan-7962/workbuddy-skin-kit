---
name: workbuddy-skin
description: 给 WorkBuddy 桌面版（Windows）换自定义背景皮肤/壁纸。用户提供图片，Agent 完成主题创建、启动器生成，用户双击一次即可生效。触发词：换皮肤、换壁纸、换背景、WorkBuddy皮肤、WorkBuddy外观、skin。仅在 Windows + WorkBuddy 桌面版可用；Mac/Web 不支持。
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
metadata:
  author: Ryan
  version: "1.0.0"
  based-on: cdredfox/workbuddy-skin-studio（已内置，含可拖拽图标补丁）
---

# workbuddy-skin

给 WorkBuddy 桌面版换自定义背景皮肤。原理：CDP（Chrome DevTools Protocol）运行时注入 CSS + 背景图，**不修改 WorkBuddy 安装文件**。

## 安装后必须先告诉用户（逐字转达）

> 皮肤功能已装好。用法：
> 1. 给我一张图（或图的路径）+ 想要的主题名，我来做成皮肤主题；
> 2. 我会在你桌面建好「WorkBuddy皮肤启动」文件夹；
> 3. 你**完全退出 WorkBuddy 后双击文件夹里的 cmd**，皮肤就生效（右上角出现 🎨 按钮，可拖动位置，点开可切换主题/上传图片/恢复原生）。
> 注意：皮肤是运行时注入，WorkBuddy 或电脑重启后失效，重新双击即可。仅支持 Windows 桌面版。

## 硬约束（违反必失败）

1. **仅 Windows + WorkBuddy 桌面版**。其他平台直接告知不支持，不要尝试。
2. **Agent 绝不代跑启动器 cmd** —— 它会 taskkill WorkBuddy（即 Agent 自己），导致会话中断且注入步骤无人执行。生成后引导用户双击。
3. **批处理文件禁止手写** —— 必须用 `tools/generate-launcher.mjs` 生成（保证 CRLF；LF 会让 cmd 把 echo/start 切碎报错）。同理，不要对生成的 cmd 用 sed -i 之类的工具改写（会剥掉 CRLF）。
4. **图片由用户提供**。用户没给图就先问，不要自己生成。

## 工作流

### Step 0 — 环境检查

| 检查项 | 命令/方法 | 失败处理 |
|---|---|---|
| node | `node -v` | 找 WorkBuddy managed node：`%USERPROFILE%\.workbuddy\binaries\node\versions\*\node.exe`；都没有则让用户装 Node LTS |
| WorkBuddy.exe | 默认 `%LOCALAPPDATA%\Programs\workbuddy\WorkBuddy.exe` | 让用户确认安装路径，用 `WORKBUDDY_EXE` 环境变量指定 |
| studio | 本 skill 目录下 `studio/src/cli.mjs` | 缺失则重新解压 skill 包 |

本 skill 目录记为 `SKILL_DIR`（包含本 SKILL.md 的目录），studio 在 `SKILL_DIR/studio`。

### Step 1 — 收集参数（一次问清，默认给足）

- 图片路径（必需）
- 主题名（可选，默认用文件名）
- 深色/浅色（可选，默认 auto 按图片亮度自动决定 —— 见「日夜间适配」）

### Step 2 — 创建主题

```bash
node "SKILL_DIR/studio/src/cli.mjs" doctor          # 预检（可选但推荐）
node "SKILL_DIR/studio/src/cli.mjs" create --image "图片路径" --name "主题名"
```

记录返回的 `id`（如 `pogacar-dark-fade-12d42f1a`）。

两个实操要点：

- **`--name` 会被 slugify 成 id**（只保留 `[a-z0-9]` 与连字符）。传中文会被全部吃掉，id 退化成 `custom-skin-xxxxxxxx`。所以 `--name` 用英文或拼音，中文显示名在 create 之后改 `theme.json` 的 `name` 字段。
- **竖版素材（手机壁纸、竖版海报）必须先重构成横版**：背景 CSS 是 `right center / cover`，1080×1439 的竖图在 16:9 窗口下会被放大 ~1.78 倍再垂直居中裁切，只剩中间约 43%，顶部品牌 logo 必然丢失。做法：合成 2560×1440 画布——左侧用主题 surface 色填充，右侧原图 contain 到满高（不裁切），接缝处做 ~160px alpha 淡出。这样 logo 与人物完整，左侧留白正好落在 WorkBuddy 内容区。

### Step 3 — 配色校正（做品牌向 / 深色主题时必须做）

**`cli.mjs create` 不做自动取色。** `theme-store.mjs` 的 `createSingleImageTheme` 在未收到 `colors` 时直接写入固定默认值（`accent #24c9d7 / secondary #ef8fd3 / surface #f7fbff / text #17344f`），而 `cli.mjs` 调用它时并不传 `colors`。自动取色只存在于 WorkBuddy 内 🎨 面板的「＋自定义图片」上传路径——那是渲染进程里的另一套代码，与 CLI 无关。

所以**凡是要贴合素材或品牌配色的主题，一律在 create 之后手改 `%LOCALAPPDATA%\WorkBuddySkinStudio\themes\<id>\theme.json`**，或直接手写主题目录（`theme.json` + hero 图，`schemaVersion: 1`，id 限小写字母数字与连字符，colors 四项都必须是 6 位 HEX）。示例：

```json
{ "accent": "#f5c518", "secondary": "#24c9d7", "surface": "#0b0b0f", "text": "#eaeaea" }
```

accent 保留自动提取的主色即可，surface/text 按上例改。

### Step 4 — 生成启动器

```bash
node "SKILL_DIR/tools/generate-launcher.mjs" --theme-id <id> --studio-dir "SKILL_DIR/studio"
```

它会在桌面创建 `WorkBuddy皮肤启动\` 并写入两个文件（CRLF 自检内置）：

| 文件 | 作用 |
|---|---|
| `启动WorkBuddy-注入皮肤.cmd` | 主流程：杀残留进程 → vbs 脱离控制台启动 WorkBuddy（调试模式）→ 等待 9223 端口 → 注入主题 |
| `wb-launch.vbs` | 脱离控制台启动器。**没有它，用户关 cmd 窗口会连坐杀死 WorkBuddy**（Electron 响应控制台关闭事件） |

两文件必须同目录（cmd 用 `%~dp0` 找 vbs）。

### Step 5 — 引导用户执行（Agent 到此停手）

逐字告诉用户：

> 桌面「WorkBuddy皮肤启动」文件夹已建好。请**完全退出 WorkBuddy**（托盘右键退出），然后双击文件夹里的「启动WorkBuddy-注入皮肤.cmd」。看到 `SUCCESS: Theme injected!` 即成功，黑窗口可以随手关掉，不影响 WorkBuddy。右上角 🎨 按钮可以**按住拖动**到任意位置。

## 持久化（用户问"重启后怎么保留"时用）

皮肤是运行时注入，**CDP 端口只在 WorkBuddy 带 `--remote-debugging-port` 启动时才存在**，所以持久化的本质是【接管启动入口】，而不是改安装包。

`tools/wb-skin-boot.mjs` 是静默启动器（无控制台窗口、幂等、带日志）：

| 命令 | 作用 |
|---|---|
| `node "SKILL_DIR/tools/wb-skin-boot.mjs" install` | 生成 `wb-skin-silent.vbs` + 桌面快捷方式「WorkBuddy（带皮肤）」 |
| `... enable` | 装入「启动」文件夹（开机自动带皮肤启动 WorkBuddy） |
| `... disable` | 移除开机自启 |
| `... status` | 查看接线状态、CDP 是否就绪 |
| `...`（无参数） | 主体流程：探测 → 必要时以调试模式重启 → 注入 |

实操要点：

- 默认主题写在 `%LOCALAPPDATA%\WorkBuddySkinStudio\default-theme.txt`，改它即可换；也认 `WB_SKIN_THEME` 环境变量。
- **幂等**：CDP 已就绪时只重新注入、不重启 WorkBuddy；只有在「在跑但没有调试端口」时才终止重启——这正是必须从入口接管、而非事后补救的原因。
- 日志：`%LOCALAPPDATA%\WorkBuddySkinStudio\boot.log`。
- 启动器无窗口，与 Step 4 那个会弹黑窗的 cmd 是两条路，可共存。
- 写 .vbs 时必须用 **UTF-16LE + BOM**（`Buffer.concat([Buffer.from([0xff,0xfe]), Buffer.from(s,'utf16le')])`），否则中文路径会乱码。
- **不要**为了持久化去改 `app.asar`：破坏签名、WorkBuddy 升级即失效，维护成本远高于收益。

## 配色覆盖范围（变量覆盖不到的地方，重要）

`--cb-*` 设计变量只能改「面板级」配色（侧边栏、顶栏、按钮、描边）。**内容渲染层完全不认变量，用的是固定色值**：

| 组件 | 类名 | 固定色 | 只覆盖变量会怎样 |
|---|---|---|---|
| 消息正文 | `.cr-markdown` / `.cr-text-block` / `.cr-agent__content` | `rgba(0,0,0,0.9)` | 深色主题下 **深底 × 深字 = 不可读** |
| 代码块 | `.cr-code-like-box` / `__header` | `rgb(255,255,255)` | 深色底上突兀的白色块 |
| 卡片 | `.cb-agent-card` | 底 `rgb(230,230,230)` | 底色没变，但文字已跟随 `--wb-text` → **浅底 × 浅字 = 也不可读** |
| 输入框 | `.cr-input-container` | `rgb(255,255,255)` | 同上 |

**症状识别**：如果同时看到「深底 × 深字」和「浅底 × 浅字」，就是这个问题——不是遮罩强度不对，是内容层没被覆盖。

**处理**：在 `skin-css.mjs` 的「内容组件配色」一节按类名直接覆盖；底色一律用 `color-mix(in srgb, var(--wb-surface) 86~93%, var(--wb-text))` 从主题色推导，深浅主题自动适配，不必写两套。

**别绕的路**：`body` 上**不存在** `--vscode-*` 变量（实测为空），想靠覆盖 VS Code 语义变量去影响 `cr-*` 渲染器行不通。

## 主内容区遮罩强度（按素材花哨程度调）

`[data-view-id=main-content]` 上有一层半透明面板色遮罩，作用是让背景图"隐约可见"而不是"抢正文的戏"。默认值：

```css
background: linear-gradient(180deg,
  color-mix(in srgb, var(--wb-surface) 62%, transparent) 0 40%,
  color-mix(in srgb, var(--wb-surface) 84%, transparent) 100%) !important;
```

- **纯透明（0%）不可取**：正文会直接压在人物、海报大字上，浅色主题下几乎读不出来
- **实用区间 55%~70%**：背景仍有明显存在感，正文可读
- 素材越花（满屏大字、高对比图形）越要往 70% 靠；素材干净（纯色渐变、人像留白多）可降到 45%
- 快速试强度不用改源码：`node tools/test_mask.mjs <port> <输出目录> "45,60,75"`，它会临时注入覆盖层并逐档截图，退出时自动还原

## 日夜间适配（已内置机制，不用额外开发）

- 主题的 `surface` 颜色决定整个 WorkBuddy 联动切深色/浅色模式（注入脚本里的 `applyMode` 会翻转 vscode-dark/light）。
- surface 默认按图片亮度自动选；用户可指定，或创建**同一图片的两个主题**（一深一浅），通过 🎨 面板手动切换。
- **不做**按时间自动切换 —— 注入本身是运行时行为、重启即失效，再做定时切换是过度工程。用户问起来按此解释。

## 🎨 图标可拖拽（已内置补丁）

本 skill 内置的 studio 已打补丁：🎨 按钮按住可拖动，位置存 localStorage 持久化，区分点击（<5px 开合面板）与拖拽。不再需要用户做任何事。

## 故障速查

| 现象 | 根因 | 处理 |
|---|---|---|
| cmd 窗口报 `'ho'/'cho'/'meout'/'ait_loop' 不是命令` | 批处理被写成 LF 换行 | 一律用 generate-launcher.mjs 重新生成 |
| 关掉 cmd 窗口 WorkBuddy 也退了 | 绕过 vbs 直接 start 启动 | 确认 cmd 里是 `wscript //nologo "%~dp0wb-launch.vbs"` |
| `[3/4]` 等待超时 | WorkBuddy 未以调试模式起来 | 确认已完全退出旧进程再双击；检查 9223 未被占用 |
| 重启电脑/WorkBuddy 后皮肤没了 | 正常，注入是运行时行为 | 重新双击 cmd |
| 主题颜色不对（深图浅底） | 自动取色按平均亮度误判 | 按 Step 3 改 theme.json |
| 🎨 按钮"消失"（`cli status` 显示 `menu:true` 但肉眼找不到） | localStorage 的拖拽坐标在当前窗口下越界（此前在更宽的窗口拖过） | 已修：注入时校验坐标是否在视口内、失效则回退右上角默认位；并监听 resize 自动拉回。旧环境可先清 `localStorage.workbuddySkinMenuPos` |
| 只有侧边栏/顶栏变色，中间执行框仍不透明 | WorkBuddy 5.5.6 起对话区主容器改名为 `.conversation-shell` 且自带不透明底色（跟随 VS Code 深浅模式），旧版置透明清单没覆盖它；同时 `.main-content` 已改名 `.teams-main-content` | 已修：把 `.conversation-shell` / `.conversation-page-chrome` / `.conversation-timeline` / `.teams-main-content` / `.teams-content-wrapper` 纳入置透明规则，并把 `html/body` 背景设为 `var(--wb-surface)`（默认纯白会在深色主题下露白块）。换大版本后重跑 `tools/diag_skin_css.mjs` 核对锚点 |
| 某个功能页（新建任务 / 助理 / 定时任务…）背景仍是默认底色 | 每个 route 用各自命名的顶层容器：欢迎页 `.wb-home-route`、助理 `.claw-workspace`、定时任务 `.automation-main-page`——逐个补必然漏 | 已修：置透明清单补全，并加 `[class*="wb-"][class*="-route"]` 兜底。**换版本后跑 `tools/audit_routes.mjs` 逐页核验**（会点进每个入口，报告该页是否还有大块不透明容器） |

## 更新 studio（可选）

内置 studio 源自 https://github.com/cdredfox/workbuddy-skin-studio 。如需升级，用上游 `src/` 覆盖 `SKILL_DIR/studio/src/` 后，**重新应用可拖拽补丁**（见 git 历史或联系 skill 作者）。
