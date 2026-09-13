#!/usr/bin/env node
/**
 * audit_contrast.mjs — 用 WCAG 对比度公式审计所有主题的配色可读性
 *
 * 第一性原理：换肤的本质是把「颜色不可控的壁纸」映射成「必须可读的 UI 配色」。
 * 可读性不是审美问题，是可以量化的约束：正文字与所在底的对比度需 ≥ 4.5:1，
 * 次级文字 ≥ 3:1。靠肉眼判断必然漏，必须算。
 *
 * 审计项（对应 skin-css 实际渲染出的层次）：
 *   1. surface × text                      —— 正文（硬约束 ≥ 4.5）
 *   2. surface × 内容块底 mix(surface,text,86%)  —— 正文落在代码块/卡片上时
 *   3. text    × 内容块底                   —— 代码块内文字
 *   4. accent  × surface                    —— 强调色/链接/按钮是否可见（≥ 3）
 *
 * 用法：node audit_contrast.mjs [主题目录...]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "C:/Users/yuanyuan1/.workbuddy/skills/workbuddy-skin/studio/themes",
      "C:/Users/yuanyuan1/AppData/Local/WorkBuddySkinStudio/themes",
    ];

// ── WCAG 相对亮度 ─────────────────────────────────────────────
function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(rgb) {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const hex2rgb = (h) => {
  const v = h.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
/** 与 skin-css 中 color-mix(in srgb, A p%, B) 等价的线性混合 */
const mix = (a, b, p) => a.map((v, i) => v * p + b[i] * (1 - p));
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const fmt = (n) => n.toFixed(2).padStart(5);

const rows = [];
for (const root of ROOTS) {
  let dirs = [];
  try { dirs = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory()); } catch { continue; }
  for (const dir of dirs) {
    let m;
    try { m = JSON.parse(readFileSync(join(root, dir, "theme.json"), "utf8")); } catch { continue; }
    const c = m.colors ?? {};
    const surface = hex2rgb(c.surface ?? "#ffffff");
    const text = hex2rgb(c.text ?? "#000000");
    const accent = hex2rgb(c.accent ?? "#24c9d7");
    const blockBg = mix(surface, text, 0.86);   // 代码块/卡片底（与 skin-css 一致）
    const accentReadable = mix(accent, text, 0.64); // skin-css 的 --wb-accent-readable

    rows.push({
      id: m.id,
      mode: luminance(surface) > 0.5 ? "浅" : "深",
      body: contrast(surface, text),          // 正文
      onBlock: contrast(blockBg, text),       // 代码块内文字
      blockEdge: contrast(surface, blockBg),  // 块与底的层次
      accentRaw: contrast(accent, surface),   // 品牌色直接用（旧做法）
      accentFixed: contrast(accentReadable, surface), // 混入 text 后（现做法）
      colors: `${toHex(surface)} / ${toHex(text)}`,
    });
  }
}

console.log("主题".padEnd(30) + "模式  正文×底  块内  块层次  强调原色→修正后  判定");
console.log("-".repeat(94));
let bad = 0;
for (const r of rows.sort((a, b) => a.accentFixed - b.accentFixed)) {
  const issues = [];
  if (r.body < 4.5) issues.push("正文对比不足");
  if (r.onBlock < 4.5) issues.push("块内文字不足");
  if (r.accentFixed < 3) issues.push("强调色仍偏弱");
  if (r.blockEdge < 1.06) issues.push("块与底无层次");
  if (issues.length) bad += 1;
  console.log(
    r.id.padEnd(30) + r.mode.padEnd(5) +
    fmt(r.body) + "  " + fmt(r.onBlock) + "  " + fmt(r.blockEdge) + "   " +
    fmt(r.accentRaw) + " → " + fmt(r.accentFixed) + "   " + (issues.length ? "✗ " + issues.join("/") : "✓"),
  );
}
console.log("-".repeat(94));
console.log(`共 ${rows.length} 个主题，${bad} 个不达标`);
console.log("阈值：正文≥4.5  块内文字≥4.5  强调色≥3  块层次≥1.06");
console.log("强调色按 --wb-accent-readable（accent 混入 72% text）判定，与 skin-css 实现一致");
