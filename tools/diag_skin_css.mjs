#!/usr/bin/env node
/**
 * diag_skin_css.mjs — 对抗性审查：核对皮肤 CSS 依赖的 DOM 锚点在当前 WorkBuddy 版本是否依然有效
 *
 * 背景：skin-css.mjs 靠三类锚点工作
 *   1. body[data-application-name=workbuddy] 上的 --cb-* 设计变量（覆盖颜色）
 *   2. [data-view-id=sidebar|main-content|detail-panel] 的透明/磨砂规则
 *   3. .teams-container / .conversation-list / .main-content / .sidebar-next 的置透明规则
 * 只要第 2、3 类失效，就会表现为「侧栏和顶栏变色了，但中间区域还是不透明」。
 *
 * 本脚本一次性输出：变量是否还在、三类锚点是否还匹配、中心区域元素的祖先链及其背景色、
 * 大块不透明元素清单，以及一张真实渲染截图。
 *
 * 用法：node diag_skin_css.mjs [port] [截图输出路径]
 */
import { writeFileSync } from "node:fs";

import { CdpSession, fetchRendererTargets } from "file:///C:/Users/yuanyuan1/.workbuddy/skills/workbuddy-skin/studio/src/cdp-client.mjs";

const PORT = Number(process.argv[2] || 9223);
const SHOT_PATH = process.argv[3] || "C:/Users/yuanyuan1/WorkBuddy/2026-09-12-18-07-50/publish/_render-check.png";

const PROBE = `(() => {
  const out = {};
  const cs = (el) => getComputedStyle(el);
  const brief = (el) => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    cls: typeof el.className === "string" ? el.className.slice(0, 110) : null,
    viewId: (el.dataset && el.dataset.viewId) || null,
  });

  // 1) --cb-* 设计变量是否仍挂在 body 上
  const bcs = cs(document.body);
  out.vars = {
    applicationName: document.body.dataset.applicationName || null,
    cbBgPrimary: bcs.getPropertyValue("--cb-bg-primary").trim() || null,
    cbBgSecondary: bcs.getPropertyValue("--cb-bg-secondary").trim() || null,
    cbTextPrimary: bcs.getPropertyValue("--cb-text-primary").trim() || null,
    wbSurface: bcs.getPropertyValue("--wb-surface").trim() || null,
  };

  // 2) 三类锚点是否还能匹配到元素
  out.anchors = {
    dataViewIds: [...document.querySelectorAll("[data-view-id]")].map((e) => e.dataset.viewId),
    teamsContainer: document.querySelectorAll(".teams-container").length,
    conversationList: document.querySelectorAll(".conversation-list").length,
    mainContent: document.querySelectorAll(".main-content, .main-content--welcome").length,
    sidebarNext: document.querySelectorAll(".sidebar-next").length,
    root: document.querySelectorAll("#root").length,
  };

  // 3) 视口中心（应为对话区）自下而上的祖先链，定位到底是谁在提供不透明背景
  const chain = [];
  let el = document.elementFromPoint(window.innerWidth * 0.5, window.innerHeight * 0.5);
  while (el && el !== document.documentElement && chain.length < 24) {
    const s = cs(el);
    const r = el.getBoundingClientRect();
    chain.push(Object.assign(brief(el), {
      bg: s.backgroundColor,
      bgImg: s.backgroundImage === "none" ? null : s.backgroundImage.slice(0, 46),
      size: Math.round(r.width) + "x" + Math.round(r.height),
    }));
    el = el.parentElement;
  }
  out.centerChain = chain;

  // 4) 大块不透明元素（嫌疑犯清单）
  out.largeOpaque = [...document.querySelectorAll("body *")]
    .map((e) => ({ e, s: cs(e), r: e.getBoundingClientRect() }))
    .filter((x) => x.r.width > 420 && x.r.height > 260
      && x.s.backgroundColor && x.s.backgroundColor !== "rgba(0, 0, 0, 0)")
    .slice(0, 14)
    .map((x) => Object.assign(brief(x.e), {
      bg: x.s.backgroundColor,
      size: Math.round(x.r.width) + "x" + Math.round(x.r.height),
    }));

  // 5) #root 与 body 自身背景
  const root = document.getElementById("root");
  out.rootBg = root ? { bg: cs(root).backgroundColor, bgImg: cs(root).backgroundImage.slice(0, 70) } : null;
  out.bodyBg = cs(document.body).backgroundColor;

  return out;
})()`;

const targets = await fetchRendererTargets(PORT, { timeoutMs: 6000 });
if (!targets.length) {
  console.error("未发现 renderer target，确认 WorkBuddy 是否以调试模式运行");
  process.exit(1);
}

const session = new CdpSession(targets[0].webSocketDebuggerUrl);
await session.open();
try {
  const result = await session.evaluate(PROBE);
  console.log(JSON.stringify(result, null, 2));

  try {
    const shot = await session.send("Page.captureScreenshot", { format: "png" }, { timeoutMs: 25000 });
    if (shot?.data) {
      writeFileSync(SHOT_PATH, Buffer.from(shot.data, "base64"));
      console.log(`\n渲染截图: ${SHOT_PATH}`);
    }
  } catch (error) {
    console.log(`\n截图失败: ${error?.message ?? error}`);
  }
} finally {
  session.close();
}
