#!/usr/bin/env node
/**
 * audit_modals.mjs — 对抗性审查：检查模态层（设置等）是否也存在背景露底
 *
 * 思路：导航页逐个核验过了，但弹层是另一套渲染路径。这里点开用户菜单 → 设置，
 * 报告模态层内的大块不透明元素并截图。
 *
 * 用法：node audit_modals.mjs [port] [截图路径]
 */
import { writeFileSync } from "node:fs";

import { CdpSession, fetchRendererTargets } from "file:///C:/Users/yuanyuan1/.workbuddy/skills/workbuddy-skin/studio/src/cdp-client.mjs";

const PORT = Number(process.argv[2] || 9223);
const OUT = process.argv[3] || "C:/Users/yuanyuan1/WorkBuddy/2026-09-12-18-07-50/publish/_settings.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await fetchRendererTargets(PORT, { timeoutMs: 6000 });
if (!targets.length) { console.error("未发现 renderer target"); process.exit(1); }

const session = new CdpSession(targets[0].webSocketDebuggerUrl);
await session.open();
try {
  // 1) 点开左下角用户菜单
  const opened = await session.evaluate(
    `(() => { const t = document.querySelector(".user-menu-trigger-avatar"); if (!t) return false; t.click(); return true; })()`,
  );
  console.log("用户菜单入口:", opened ? "已点击" : "未找到");
  await sleep(900);

  // 2) 菜单里找「设置」
  const menuItems = await session.evaluate(`(() => {
    return [...document.querySelectorAll("*")]
      .filter((el) => el.children.length === 0 && /^设置/.test((el.textContent || "").trim()))
      .map((el) => { const b = el.getBoundingClientRect();
        return { text: (el.textContent || "").trim().slice(0, 12), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) }; })
      .filter((x) => x.w > 0)
      .slice(0, 6);
  })()`);
  console.log("菜单命中:", JSON.stringify(menuItems));

  if (menuItems.length) {
    const label = menuItems[0].text;
    await session.evaluate(`(() => {
      const el = [...document.querySelectorAll("*")].find((e) =>
        e.children.length === 0 && (e.textContent || "").trim() === ${JSON.stringify("PLACEHOLDER")});
      return !!el;
    })()`.replace("PLACEHOLDER", label));
    await session.evaluate(`(() => {
      const el = [...document.querySelectorAll("*")].find((e) =>
        e.children.length === 0 && (e.textContent || "").trim() === ${JSON.stringify(label)});
      if (!el) return false;
      let n = el;
      for (let i = 0; i < 5 && n.parentElement; i += 1) {
        n = n.parentElement;
        if (n.tagName === "BUTTON" || n.getAttribute("role") === "button" || n.hasAttribute("tabindex")) break;
      }
      n.click();
      return true;
    })()`);
    await sleep(1700);
  }

  // 3) 报告模态层内的大块不透明元素
  const opaque = await session.evaluate(`(() => {
    return [...document.querySelectorAll("body *")]
      .map((e) => ({ e, s: getComputedStyle(e), r: e.getBoundingClientRect() }))
      .filter((x) => x.r.width > 360 && x.r.height > 220
        && x.s.backgroundColor && x.s.backgroundColor !== "rgba(0, 0, 0, 0)")
      .slice(0, 8)
      .map((x) => ({
        cls: (typeof x.e.className === "string" ? x.e.className : "").slice(0, 48),
        bg: x.s.backgroundColor,
        size: Math.round(x.r.width) + "x" + Math.round(x.r.height),
      }));
  })()`);
  console.log("\n模态层内的大块不透明元素:");
  for (const o of opaque) console.log(`  ${o.cls || "(无类名)"}  ${o.bg}  ${o.size}`);

  const shot = await session.send("Page.captureScreenshot", { format: "png" }, { timeoutMs: 25000 });
  if (shot?.data) {
    writeFileSync(OUT, Buffer.from(shot.data, "base64"));
    console.log(`\n截图: ${OUT}`);
  }
} finally {
  session.close();
}
