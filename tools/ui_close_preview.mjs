#!/usr/bin/env node
/**
 * ui_close_preview.mjs — 关闭 WorkBuddy 右侧的预览/结果面板，便于截取完整壁纸效果
 *
 * 策略：右侧面板即 [data-view-id="detail-panel"]。WorkBuddy 的类名是 CSS Module 哈希
 * （形如 _gridViewItem_1rywu_14），没有语义可循，所以只能按位置找控件：
 * 在面板内挑「y 最小、x 最大」的 button，即标题栏最右侧的关闭按钮。
 * 点完校验面板是否真的收起了。
 *
 * 用法：node ui_close_preview.mjs [port] [--dry-run]
 */
import { CdpSession, fetchRendererTargets } from "file:///C:/Users/yuanyuan1/.workbuddy/skills/workbuddy-skin/studio/src/cdp-client.mjs";

const PORT = Number(process.argv[2] || 9223);
const DRY_RUN = process.argv.includes("--dry-run");

const FIND = `(() => {
  const panel = document.querySelector('[data-view-id="detail-panel"]');
  if (!panel) return { panelFound: false, reason: "detail-panel 不存在" };
  const rect = panel.getBoundingClientRect();
  const buttons = [...panel.querySelectorAll("button, [role=button]")]
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { el, x: r.x, y: r.y, w: r.width, h: r.height };
    })
    .filter((b) => b.w > 0 && b.h > 0);
  if (!buttons.length) return { panelFound: true, buttons: 0 };
  // 标题栏最右侧 = y 最小、x 最大
  buttons.sort((a, b) => (a.y - b.y) || (b.x - a.x));
  const target = buttons[0];
  return {
    panelFound: true,
    panelRect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    candidates: buttons.slice(0, 6).map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), cls: (typeof b.el.className === "string" ? b.el.className : "").slice(0, 40) })),
    targetIndex: 0,
  };
})()`;

const CLICK = `(() => {
  const panel = document.querySelector('[data-view-id="detail-panel"]');
  if (!panel) return { clicked: false, reason: "no panel" };
  // 优先用有语义的类名（WorkBuddy 大部分是 CSS Module 哈希，但产物标签保留了可读类名）
  const byClass = panel.querySelector(".artifact-tab__close");
  if (byClass) {
    const r = byClass.getBoundingClientRect();
    byClass.click();
    return { clicked: true, via: "artifact-tab__close", at: { x: Math.round(r.x), y: Math.round(r.y) } };
  }
  const buttons = [...panel.querySelectorAll("button, [role=button]")]
    .map((el) => { const r = el.getBoundingClientRect(); return { el, x: r.x, y: r.y, w: r.width, h: r.height }; })
    .filter((b) => b.w > 0 && b.h > 0)
    .sort((a, b) => (a.y - b.y) || (b.x - a.x));
  if (!buttons.length) return { clicked: false, reason: "no button" };
  buttons[0].el.click();
  return { clicked: true, via: "position-heuristic", at: { x: Math.round(buttons[0].x), y: Math.round(buttons[0].y) } };
})()`;

const CHECK = `(() => {
  const panel = document.querySelector('[data-view-id="detail-panel"]');
  if (!panel) return { stillOpen: false };
  const r = panel.getBoundingClientRect();
  return { stillOpen: r.width > 60, width: Math.round(r.width) };
})()`;

const targets = await fetchRendererTargets(PORT, { timeoutMs: 6000 });
if (!targets.length) { console.error("未发现 renderer target"); process.exit(1); }

const session = new CdpSession(targets[0].webSocketDebuggerUrl);
await session.open();
try {
  const found = await session.evaluate(FIND);
  console.log("探测:", JSON.stringify(found, null, 2));
  if (!found.panelFound) { console.log("右侧面板本来就没开，无需处理"); process.exit(0); }
  if (DRY_RUN) { console.log("dry-run：不点击"); process.exit(0); }

  const clickResult = await session.evaluate(CLICK);
  console.log("点击:", JSON.stringify(clickResult));
  await new Promise((r) => setTimeout(r, 900));
  console.log("校验:", JSON.stringify(await session.evaluate(CHECK)));
} finally {
  session.close();
}
