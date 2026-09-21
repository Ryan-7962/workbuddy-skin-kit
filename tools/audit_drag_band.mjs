/**
 * 逐页审计「顶栏拖拽带」的高度。
 *
 * 背景：按钮若落在 -webkit-app-region:drag 区域内，真人点击会被 Electron 当标题栏拖动吞掉
 * （DOM 命中测试仍显示命中按钮，所以查不出问题）。皮肤注入时按当前页算出一个安全落点，
 * 若其他页面的顶栏更高，切过去就会复发。此脚本把每个导航页的拖拽带底边量与按钮落点对比。
 *
 * 用法：node audit_drag_band.mjs [port]
 */
import { CdpSession, fetchRendererTargets } from "file:///C:/Users/yuanyuan1/.workbuddy/skills/workbuddy-skin/studio/src/cdp-client.mjs";

const PORT = Number(process.argv[2] || 9223);
const targets = await fetchRendererTargets(PORT, { timeoutMs: 8000 });
const session = new CdpSession(targets[0].webSocketDebuggerUrl);
await session.open();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 读当前页的拖拽带底边 + 按钮矩形
const probe = `(() => {
  let bandBottom = 0, owner = "";
  for (const el of document.querySelectorAll("body div")) {
    const b = el.getBoundingClientRect();
    if (b.bottom <= 0 || b.top > Math.min(240, Math.max(120, innerHeight * 0.4))) continue;
    if (b.width < innerWidth * 0.25) continue;
    const reg = getComputedStyle(el).webkitAppRegion || "";
    if (reg === "drag" && b.bottom > bandBottom) {
      bandBottom = b.bottom;
      owner = (typeof el.className === "string" ? el.className : "").slice(0, 40) || "(无类名)";
    }
  }
  const btn = (document.getElementById("workbuddy-skin-menu") || document.querySelector('[id*="skin-menu"]'))?.querySelector("button");
  const br = btn ? btn.getBoundingClientRect() : null;
  return {
    bandBottom: Math.round(bandBottom),
    bandOwner: owner || "(无)",
    buttonTop: br ? Math.round(br.top) : null,
    ok: br ? Math.round(br.top) >= bandBottom : null,
  };
})()`;

// 枚举侧边栏导航项（用语义类名，避免文本匹配漏项）
const navs = await session.evaluate(`(() => {
  const nodes = [...document.querySelectorAll(".conversation-list-tab-button")];
  return nodes.map((el) => {
    const b = el.getBoundingClientRect();
    return { text: (el.textContent || "").trim().slice(0, 20), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  }).filter((n) => n.y > 0);
})()`);

console.log("顶栏拖拽带逐页审计（bandBottom = 会被吞点击的高度阈值，buttonTop 须 ≥ 它）\n");
console.log("页面".padEnd(22) + "带底边  drag 容器".padEnd(30) + " 按钮 top  判定");
console.log("-".repeat(78));
const rows = [];
for (const n of navs) {
  await session.evaluate(`(() => {
    const el = [...document.querySelectorAll(".conversation-list-tab-button")]
      .find((e) => (e.textContent || "").trim().slice(0, 20) === ${JSON.stringify(n.text)});
    el?.click(); return true;
  })()`);
  await sleep(1100);
  const r = await session.evaluate(probe);
  rows.push({ page: n.text, ...r });
  console.log(
    n.text.padEnd(22) + String(r.bandBottom).padEnd(8) + r.bandOwner.padEnd(30) +
    String(r.buttonTop ?? "-").padEnd(11) + (r.ok ? "✓" : r.ok === null ? "? 无按钮" : "✗ 落在带内"),
  );
}
console.log("-".repeat(78));
const bad = rows.filter((r) => r.ok === false);
console.log(`共 ${rows.length} 页，${bad.length} 页按钮落在拖拽带内`);

// 回到对话页
await session.evaluate(`(() => {
  const el = [...document.querySelectorAll(".conversation-list-tab-button")]
    .find((e) => (e.textContent || "").trim().slice(0, 20) === ${JSON.stringify(navs[0]?.text || "新建任务")});
  el?.click(); return true;
})()`);
session.close();
