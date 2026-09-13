#!/usr/bin/env node
/**
 * diag_colors.mjs — 定位「深底深字 / 白色卡片」的颜色来源
 *
 * 背景：--cb-* 变量覆盖只解决了"面板级"配色。WorkBuddy 的消息渲染器（.cr-theme）
 * 和卡片组件（.cb-agent-card）各有一套自己的颜色体系，需要单独找出来才能覆盖。
 *
 * 用法：node diag_colors.mjs [port]
 */
import { CdpSession, fetchRendererTargets } from "file:///C:/Users/yuanyuan1/.workbuddy/skills/workbuddy-skin/studio/src/cdp-client.mjs";

const PORT = Number(process.argv[2] || 9223);

const PROBE = `(() => {
  const out = {};
  const cs = (el) => getComputedStyle(el);

  // 1) 当前主题的基础色，确认注入是否生效
  const bcs = cs(document.body);
  out.themeVars = {
    surface: bcs.getPropertyValue("--wb-surface").trim(),
    text: bcs.getPropertyValue("--wb-text").trim(),
    cbTextPrimary: bcs.getPropertyValue("--cb-text-primary").trim(),
    vscodeThemeKind: document.body.dataset.vscodeThemeKind || null,
    activeTheme: document.documentElement.dataset.workbuddySkin || null,
  };

  // 2) 正文段落的实际颜色 + 它用的自定义属性
  const para = document.querySelector(".cr-theme p, .cr-document p, .cr-message-list p");
  if (para) {
    const ps = cs(para);
    const chain = [];
    let n = para;
    for (let i = 0; i < 6 && n; i += 1) {
      chain.push({
        cls: (typeof n.className === "string" ? n.className : "").slice(0, 44),
        color: cs(n).color,
        bg: cs(n).backgroundColor,
      });
      n = n.parentElement;
    }
    out.paragraph = { color: ps.color, chain };
  }

  // 3) .cr-theme 上的自定义属性（只挑颜色相关的，避免输出爆炸）
  const crTheme = document.querySelector(".cr-theme");
  if (crTheme) {
    const ts = cs(crTheme);
    const vars = {};
    for (const name of ts) {
      if (!name.startsWith("--")) continue;
      if (!/color|text|fg|bg|background|foreground/i.test(name)) continue;
      vars[name] = ts.getPropertyValue(name).trim().slice(0, 40);
    }
    out.crThemeVars = vars;
  }

  // 4) 白色卡片盘点
  out.whiteCards = [...document.querySelectorAll("body *")]
    .map((e) => ({ e, s: cs(e), r: e.getBoundingClientRect() }))
    .filter((x) => x.r.width > 140 && x.r.height > 24
      && /^rgb\\(25[0-5], 25[0-5], 25[0-5]\\)$|^rgb\\(24[5-9], 24[5-9], 24[5-9]\\)$/.test(x.s.backgroundColor))
    .slice(0, 10)
    .map((x) => ({
      cls: (typeof x.e.className === "string" ? x.e.className : "").slice(0, 52),
      tag: x.e.tagName.toLowerCase(),
      bg: x.s.backgroundColor,
      color: x.s.color,
      size: Math.round(x.r.width) + "x" + Math.round(x.r.height),
    }));

  return out;
})()`;

const targets = await fetchRendererTargets(PORT, { timeoutMs: 6000 });
if (!targets.length) { console.error("未发现 renderer target"); process.exit(1); }

const session = new CdpSession(targets[0].webSocketDebuggerUrl);
await session.open();
try {
  console.log(JSON.stringify(await session.evaluate(PROBE), null, 1));
} finally {
  session.close();
}
