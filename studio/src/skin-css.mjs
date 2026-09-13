// WorkBuddy 皮肤 CSS 生成
// 基于实测：WorkBuddy renderer 的 body[data-application-name=workbuddy] 上有完整的
// --cb-* 设计变量系统（60+ 个），override 它们即可全局换色；#root 作背景图层。
// 不使用 CSS module 哈希类名（._grid_xxx），只用稳定锚点。

const DEFAULT_COLORS = {
  accent: "#24c9d7",
  secondary: "#ef8fd3",
  surface: "#f7fbff",
  text: "#17344f",
};

function color(value, fallback) {
  const result = value ?? fallback;
  if (!/^#[0-9a-f]{3,8}$/i.test(result)) throw new Error(`无效主题颜色：${result}`);
  return result;
}

function copy(value, fallback = "") {
  return JSON.stringify(typeof value === "string" ? value : fallback);
}

export function buildSkinCss({ theme, heroDataUrl }) {
  if (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(heroDataUrl)) {
    throw new Error("hero 必须是本地 PNG、JPEG 或 WebP 数据");
  }
  const colors = {
    accent: color(theme.colors?.accent, DEFAULT_COLORS.accent),
    secondary: color(theme.colors?.secondary, DEFAULT_COLORS.secondary),
    surface: color(theme.colors?.surface, DEFAULT_COLORS.surface),
    text: color(theme.colors?.text, DEFAULT_COLORS.text),
  };
  const id = String(theme.id ?? "custom").replace(/[^a-z0-9_-]/gi, "");

  return `/* WORKBUDDY_SKIN:${id} */
body[data-application-name=workbuddy] {
  --wb-accent: ${colors.accent};
  --wb-secondary: ${colors.secondary};
  --wb-surface: ${colors.surface};
  --wb-text: ${colors.text};

  /* 背景 */
  --cb-bg-primary: var(--wb-surface) !important;
  --cb-bg-secondary: color-mix(in srgb, var(--wb-surface) 94%, transparent) !important;
  --cb-panel-bg-primary: color-mix(in srgb, var(--wb-surface) 88%, transparent) !important;
  --cb-team-member-card-background: color-mix(in srgb, var(--wb-surface) 88%, transparent) !important;

  /* 文字 */
  --cb-text-primary: var(--wb-text) !important;
  --cb-text-secondary: color-mix(in srgb, var(--wb-text) 70%, transparent) !important;
  --cb-text-disabled: color-mix(in srgb, var(--wb-text) 42%, transparent) !important;
  --cb-text-link: var(--wb-accent) !important;
  --cb-text-error-active: var(--wb-accent) !important;

  /* VS Code 主题色包装 */
  --cb-vscode-editor-background: var(--wb-surface) !important;
  --cb-vscode-sideBar-background: color-mix(in srgb, var(--wb-surface) 90%, transparent) !important;
  --cb-vscode-foreground: var(--wb-text) !important;
  --cb-vscode-editor-foreground: var(--wb-text) !important;
  --cb-vscode-descriptionForeground: color-mix(in srgb, var(--wb-text) 70%, transparent) !important;
  --cb-vscode-titleBar-activeBackground: var(--wb-accent) !important;
  --cb-vscode-titleBar-activeForeground: #ffffff !important;
  --cb-vscode-titleBar-inactiveBackground: color-mix(in srgb, var(--wb-accent) 80%, var(--wb-surface)) !important;
  --cb-vscode-titleBar-inactiveForeground: color-mix(in srgb, #ffffff 70%, transparent) !important;
  --cb-titlebar-control-hover-background: color-mix(in srgb, var(--wb-accent) 16%, transparent) !important;
  --cb-vscode-input-background: color-mix(in srgb, var(--wb-surface) 88%, transparent) !important;
  --cb-vscode-dropdown-background: color-mix(in srgb, var(--wb-surface) 94%, transparent) !important;
  --cb-vscode-list-hoverBackground: color-mix(in srgb, var(--wb-accent) 16%, transparent) !important;
  --cb-vscode-toolbar-hoverBackground: color-mix(in srgb, var(--wb-accent) 16%, transparent) !important;
  --cb-vscode-scrollbarSlider-background: color-mix(in srgb, var(--wb-accent) 30%, transparent) !important;
  --cb-vscode-scrollbarSlider-hoverBackground: color-mix(in srgb, var(--wb-accent) 50%, transparent) !important;
  --cb-vscode-textLink-foreground: var(--wb-accent) !important;
  --cb-vscode-widget-border: color-mix(in srgb, var(--wb-accent) 45%, transparent) !important;
  --cb-vscode-panel-border: color-mix(in srgb, var(--wb-accent) 30%, transparent) !important;

  /* 按钮 */
  --cb-button-dark-background: var(--wb-accent) !important;
  --cb-button-dark-foreground: #ffffff !important;
  --cb-button-dark-hover-background: color-mix(in srgb, var(--wb-accent) 85%, #000000) !important;
  --cb-vscode-button-background: var(--wb-accent) !important;
  --cb-vscode-button-foreground: #ffffff !important;
  --cb-vscode-button-hoverBackground: color-mix(in srgb, var(--wb-accent) 85%, #000000) !important;

  /* 描边 */
  --cb-stroke-secondary: color-mix(in srgb, var(--wb-accent) 45%, transparent) !important;
  --cb-markdown-hr-border-color: color-mix(in srgb, var(--wb-accent) 30%, transparent) !important;
}

#root {
  color: var(--wb-text) !important;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--wb-surface) 96%, transparent) 0 22%, transparent 46%),
    linear-gradient(180deg, transparent 0 45%, color-mix(in srgb, var(--wb-surface) 78%, transparent) 78% 100%),
    url(${JSON.stringify(heroDataUrl)}) right center / cover no-repeat fixed !important;
}

/* body/html 默认是纯白，深色主题下会从各层缝隙露出刺眼白块 */
html,
body {
  background: var(--wb-surface) !important;
}

/* 关键：teams-container 是 #root 直接子层，默认有不透明灰底，会完全盖住背景图 */
.teams-container,
.teams-container.is-mac {
  background: transparent !important;
}

/* 所有 grid 项容器透明，让 #root 背景图大面积透出 */
[data-view-id] {
  background: transparent !important;
}

/* 内容区内的子层也透明（否则会盖住背景图和磨砂层）
   注意：WorkBuddy 5.5.6 起对话区主容器改名为 .conversation-shell 并自带不透明底色
   （跟随 VS Code 深浅模式），漏掉它就会表现为"只有侧边栏和顶栏变色、中间执行框还是不透明"。
   .teams-main-content / .teams-content-wrapper 是新版布局容器，一并纳入以防后续版本再加底色。 */
.conversation-list,
.conversation-shell,
.conversation-page-chrome,
.conversation-timeline,
.teams-main-content,
.teams-content-wrapper,
.main-content,
.main-content--welcome,
.sidebar-next,
.wb-home-route,
.claw-workspace,
.automation-main-page,
.expert-center-page,
.expert-center-light {
  background: transparent !important;
}

/* 兜底：WorkBuddy 各功能页的顶层容器统一命名为 wb-*-route（欢迎页 = .wb-home-route），
   每个 route 各用一套容器、逐个补必然漏。按命名规律一次性覆盖，新增页面无需再改，
   否则就会出现"对话页有壁纸、新建任务页还是默认底色"这类问题。 */
[class*="wb-"][class*="-route"] {
  background: transparent !important;
}

/* 侧边栏磨砂玻璃（覆盖上面的 transparent） */
[data-view-id=sidebar] {
  background: color-mix(in srgb, var(--wb-surface) 88%, transparent) !important;
  border-right: 1px solid color-mix(in srgb, var(--wb-accent) 45%, transparent) !important;
  backdrop-filter: blur(20px) saturate(1.12);
}

/* 主内容区：加一层半透明面板色遮罩。
   背景图保持可见（约四成透出），但正文对比度恢复到可读水平——
   纯透明会让文字直接压在人物、海报大字上，浅色主题下几乎读不出来。 */
[data-view-id=main-content] {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--wb-surface) 62%, transparent) 0 40%,
    color-mix(in srgb, var(--wb-surface) 84%, transparent) 100%) !important;
}

/* 详情面板半透明磨砂 */
[data-view-id=detail-panel] {
  background: color-mix(in srgb, var(--wb-surface) 88%, transparent) !important;
  backdrop-filter: blur(18px) saturate(1.08);
}

/* brand 文案（copy 为空时不显示） */
#root::before {
  position: fixed;
  z-index: 20;
  top: 60px;
  left: max(300px, 22vw);
  content: ${copy(theme.copy?.brand)};
  color: var(--wb-accent);
  font: 800 clamp(16px, 2vw, 30px)/1.2 ui-rounded, system-ui;
  text-shadow: 0 2px 10px white;
  pointer-events: none;
}

/* headline 文案 */
#root::after {
  position: fixed;
  z-index: 20;
  top: 104px;
  left: max(300px, 22vw);
  max-width: 42vw;
  content: ${copy(theme.copy?.headline)};
  color: var(--wb-text);
  font: 750 clamp(18px, 2.7vw, 42px)/1.15 ui-rounded, system-ui;
  text-shadow: 0 2px 12px white;
  pointer-events: none;
}
`;
}
