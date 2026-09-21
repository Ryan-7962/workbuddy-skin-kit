/**
 * 诊断 🎨 皮肤按钮「点不中」的问题。
 *
 * 为什么不能只靠"程序帮它点一下"来验证：CDP 的 Input.dispatchMouseEvent 直接把事件投进渲染进程，
 * 绕过了浏览器进程对 -webkit-app-region:drag 区域的标题栏拦截。所以程序能点 ≠ 真人能点。
 * 真正的判据是几何的：按钮矩形与任何 drag 区域的重叠面积必须为 0。
 *
 * 用法：node diag_skin_click.mjs [port] [--click]
 */
import { CdpSession, fetchRendererTargets } from "file:///C:/Users/yuanyuan1/.workbuddy/skills/workbuddy-skin/studio/src/cdp-client.mjs";

const argv = process.argv.slice(2);
const doClick = argv.includes("--click");
const PORT = Number(argv.find((a) => /^\d+$/.test(a)) || 9223);

const targets = await fetchRendererTargets(PORT, { timeoutMs: 8000 });
if (!targets.length) {
  console.error("未找到渲染进程 target");
  process.exit(1);
}
const session = new CdpSession(targets[0].webSocketDebuggerUrl);
await session.open();

const report = await session.evaluate(`(() => {
  const root = document.getElementById("workbuddy-skin-menu") || document.querySelector('[id*="skin-menu"]');
  const btn =
    root?.querySelector("button") ||
    [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("🎨"));
  if (!btn) return { ok: false, reason: "未找到 🎨 按钮（可能未注入）" };

  const r = btn.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  const cx = Math.round(r.x + r.width / 2);
  const cy = Math.round(r.y + r.height / 2);

  // ---- drag 区域枚举 ----
  const drags = [...document.querySelectorAll("body div")]
    .map((el) => ({ el, b: el.getBoundingClientRect(), s: getComputedStyle(el) }))
    .filter((x) => (x.s.webkitAppRegion || "") === "drag")
    .map((x) => ({
      cls: (typeof x.el.className === "string" ? x.el.className : "").slice(0, 46) || "(无类名)",
      rect: { x: x.b.x, y: x.b.y, r: x.b.right, b: x.b.bottom, w: x.b.width, h: x.b.height },
    }))
    .filter((x) => x.rect.w > 0 && x.rect.h > 0);

  const rect = { x: r.left, y: r.top, r: r.right, b: r.bottom };
  let worstOverlap = 0;
  const hits = [];
  for (const d of drags) {
    const ow = Math.min(rect.r, d.rect.r) - Math.max(rect.x, d.rect.x);
    const oh = Math.min(rect.b, d.rect.b) - Math.max(rect.y, d.rect.y);
    if (ow > 0 && oh > 0) {
      const area = Math.round(ow * oh);
      worstOverlap = Math.max(worstOverlap, area);
      hits.push({ cls: d.cls, overlapPx: area, ofButtonPct: Math.round((area / (r.width * r.height)) * 100) + "%" });
    }
  }

  const top = document.elementFromPoint(cx, cy);

  return {
    ok: true,
    viewport: { w: innerWidth, h: innerHeight },
    button: {
      rect: Math.round(r.x) + "," + Math.round(r.y) + " " + Math.round(r.width) + "x" + Math.round(r.height),
      center: cx + "," + cy,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      appRegion: cs.webkitAppRegion || "(unset)",
    },
    verdict: {
      overlapsDragRegion: worstOverlap > 0,
      overlapPx: worstOverlap,
      dragHits: hits,
      domHitIsButton: top === btn || btn.contains(top),
      domHitTarget: top ? top.tagName.toLowerCase() + "." + ((typeof top.className === "string" ? top.className : "").slice(0, 40) || "(无类名)") : "(null)",
      clickableInPrinciple: worstOverlap === 0 && (top === btn || btn.contains(top)),
    },
  };
})()`);

if (!report.ok) {
  console.log(JSON.stringify(report, null, 2));
  session.close();
  process.exit(0);
}

// ---- 可选：程序化点击，仅用于验证点击处理器本身仍然工作（不代表真实鼠标可达） ----
if (doClick) {
  const [cx, cy] = String(report.button.center).split(",").map(Number);
  const mouse = (type) => session.send("Input.dispatchMouseEvent", {
    type, x: cx, y: cy, button: "left", buttons: 1, clickCount: 1,
  }, { timeoutMs: 10000 });
  await mouse("mousePressed");
  await mouse("mouseReleased");
  await new Promise((r) => setTimeout(r, 600));
  report.clickTest = await session.evaluate(`(() => {
    const panel = [...document.querySelectorAll("div")].find((d) => d.querySelector('div[style*="border-radius: 8px"]') && d.style.minWidth);
    const menu = document.getElementById("workbuddy-skin-menu") || document.querySelector('[id*="skin-menu"]');
    const p = menu?.children?.[1];
    return { panelDisplay: p ? getComputedStyle(p).display : "(未找到面板)", note: "程序化点击仅供验证处理器，不证明真人可达" };
  })()`);
}

console.log(JSON.stringify(report, null, 2));
session.close();
