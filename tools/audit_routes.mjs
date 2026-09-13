#!/usr/bin/env node
/**
 * audit_routes.mjs — 遍历 WorkBuddy 各功能页，找出仍未被置透明规则覆盖的页面容器
 *
 * 背景：每个 route 用各自命名的顶层容器（欢迎页 .wb-home-route、助理 .claw-workspace、
 * 定时任务 .automation-main-page…），逐个补必然漏。本脚本逐页点进去，只报告
 * 「大块不透明元素」，用于确认兜底规则是否已全覆盖。
 *
 * 实现要点：侧边栏导航项统一带 .conversation-list-tab-button 类名，直接按类名遍历，
 * 比文本匹配可靠——「专家·技能·连接器」是一个按钮，文本带中点，精确匹配会漏。
 *
 * 用法：node audit_routes.mjs [port]
 */
import { CdpSession, fetchRendererTargets } from "file:///C:/Users/yuanyuan1/.workbuddy/skills/workbuddy-skin/studio/src/cdp-client.mjs";

const PORT = Number(process.argv[2] || 9223);

const LIST_TABS = `[...document.querySelectorAll(".conversation-list-tab-button")].map((el, i) => ({
  i, text: (el.textContent || "").trim().slice(0, 20),
}))`;

const clickTab = (index) => `(() => {
  const tabs = document.querySelectorAll(".conversation-list-tab-button");
  if (!tabs[${index}]) return false;
  tabs[${index}].click();
  return true;
})()`;

const PROBE = `(() => {
  const heading = (document.querySelector("h1, h2")?.textContent || "").trim().slice(0, 22);
  const opaque = [...document.querySelectorAll("body *")]
    .map((e) => ({ e, s: getComputedStyle(e), r: e.getBoundingClientRect() }))
    .filter((x) => x.r.width > 500 && x.r.height > 320
      && x.s.backgroundColor && x.s.backgroundColor !== "rgba(0, 0, 0, 0)")
    .slice(0, 4)
    .map((x) => ({
      cls: (typeof x.e.className === "string" ? x.e.className : "").slice(0, 52),
      bg: x.s.backgroundColor,
      size: Math.round(x.r.width) + "x" + Math.round(x.r.height),
    }));
  return { heading, opaque };
})()`;

const targets = await fetchRendererTargets(PORT, { timeoutMs: 6000 });
if (!targets.length) { console.error("未发现 renderer target"); process.exit(1); }

const session = new CdpSession(targets[0].webSocketDebuggerUrl);
await session.open();
try {
  const tabs = await session.evaluate(LIST_TABS);
  console.log(`侧边栏导航项 ${tabs.length} 个\n`);
  for (const tab of tabs) {
    const ok = await session.evaluate(clickTab(tab.i));
    if (!ok) { console.log(`  ${tab.text.padEnd(10)} — 点击失败`); continue; }
    await new Promise((r) => setTimeout(r, 1700));
    const { heading, opaque } = await session.evaluate(PROBE);
    const verdict = opaque.length
      ? opaque.map((x) => `${x.cls || "(无类名)"} ${x.bg} ${x.size}`).join(" ; ")
      : "OK 无残留";
    console.log(`  ${tab.text.padEnd(10)} | ${String(heading).padEnd(20)} | ${verdict}`);
  }
} finally {
  session.close();
}
