#!/usr/bin/env node
/**
 * test_mask.mjs — 快速对比不同遮罩强度下的实际观感（不修改源文件）
 *
 * 做法：往 head 注入一条临时 <style id="mask-probe"> 覆盖 main-content 的背景，
 * 逐档强度截图。用于挑选「背景图仍可辨认」与「正文可读」之间的平衡点。
 * 关闭页面即失效，不影响 skin-css.mjs 的正式配置。
 *
 * 用法：node test_mask.mjs [port] [输出目录] [强度1,强度2,...]
 */
import { writeFileSync } from "node:fs";

import { CdpSession, fetchRendererTargets } from "file:///C:/Users/yuanyuan1/.workbuddy/skills/workbuddy-skin/studio/src/cdp-client.mjs";

const PORT = Number(process.argv[2] || 9223);
const OUT_DIR = process.argv[3] || "C:/Users/yuanyuan1/WorkBuddy/2026-09-12-18-07-50/publish/_mask";
const LEVELS = (process.argv[4] || "30,45,60").split(",").map(Number);

// 顶部到 40% 用主强度，底部渐强 22 个百分点，保证输入框区域更实
const applyMask = (top) => `(() => {
  let probe = document.getElementById("mask-probe");
  if (!probe) {
    probe = document.createElement("style");
    probe.id = "mask-probe";
    document.head.appendChild(probe);
  }
  const bottom = Math.min(96, ${top} + 22);
  probe.textContent = "body[data-application-name=workbuddy] [data-view-id=main-content]{" +
    "background:linear-gradient(180deg," +
    "color-mix(in srgb, var(--wb-surface) ${top}%, transparent) 0 40%," +
    "color-mix(in srgb, var(--wb-surface) " + bottom + "%, transparent) 100%) !important;}";
  return { top: ${top}, bottom };
})()`;

const targets = await fetchRendererTargets(PORT, { timeoutMs: 6000 });
if (!targets.length) { console.error("未发现 renderer target"); process.exit(1); }

const session = new CdpSession(targets[0].webSocketDebuggerUrl);
await session.open();
try {
  for (const level of LEVELS) {
    const info = await session.evaluate(applyMask(level));
    await new Promise((r) => setTimeout(r, 1200));
    const file = `${OUT_DIR}/mask-${level}.png`;
    const shot = await session.send("Page.captureScreenshot", { format: "png" }, { timeoutMs: 25000 });
    if (shot?.data) {
      writeFileSync(file, Buffer.from(shot.data, "base64"));
      console.log(`遮罩 ${String(level).padStart(2)}% (底部 ${info.bottom}%) → ${file}`);
    }
  }
  // 清掉临时覆盖，回到正式配置
  await session.evaluate(`document.getElementById("mask-probe")?.remove()`);
  console.log("\n已移除临时覆盖");
} finally {
  session.close();
}
