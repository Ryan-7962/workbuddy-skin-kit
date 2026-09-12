#!/usr/bin/env node
/**
 * wb-skin-boot.mjs — WorkBuddy 皮肤静默启动器（持久化方案）
 *
 * ── 为什么需要它 ──────────────────────────────────────────────
 * 皮肤是 CDP 运行时注入，而 CDP 端口只在 WorkBuddy 带
 * `--remote-debugging-port` 启动时才存在。正常双击 WorkBuddy.exe 不带这个参数
 * → 所以"重启后保留皮肤"的本质是【接管 WorkBuddy 的启动入口】，
 *   而不是改安装包（改 app.asar 会破坏签名、WorkBuddy 一升级就失效）。
 *
 * ── 子命令 ───────────────────────────────────────────────────
 *   （无参数）  探测 → 必要时以调试模式重启 → 注入主题。vbs 静默调用这个。
 *   install    生成 wb-skin-silent.vbs + 桌面快捷方式「WorkBuddy（带皮肤）」
 *   enable     把静默启动器装进「启动」文件夹（开机自动带皮肤）
 *   disable    从「启动」文件夹移除
 *   status     打印当前接线状态
 *
 * ── 配置 ─────────────────────────────────────────────────────
 *   WB_SKIN_THEME   默认主题 id（优先级最高）
 *   也可写 %LOCALAPPDATA%\WorkBuddySkinStudio\default-theme.txt
 *   WB_SKIN_PORT    CDP 端口，默认 9223
 *   WORKBUDDY_EXE   手动指定 WorkBuddy.exe 路径
 *
 * 日志：%LOCALAPPDATA%\WorkBuddySkinStudio\boot.log
 *
 * ── 幂等性 ───────────────────────────────────────────────────
 * 重复运行安全：若检测到 CDP 已就绪，直接重新注入，不重启 WorkBuddy。
 * 只有在「WorkBuddy 在跑但没有调试端口」时才会终止它并重启——
 * 这正是必须接管启动入口、而不是事后补救的原因。
 */
import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── 路径与常量 ────────────────────────────────────────────────
const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(HERE, "..", "studio");
const USER_HOME = process.env.USERPROFILE || "";
const LOCAL = process.env.LOCALAPPDATA || "";
const ROAMING = process.env.APPDATA || "";
const SYSTEM_ROOT = process.env.SystemRoot || "C:\\Windows";

const STATE_DIR = join(LOCAL, "WorkBuddySkinStudio");
const LOG_PATH = join(STATE_DIR, "boot.log");
const THEME_CFG = join(STATE_DIR, "default-theme.txt");
const LAUNCHER_DIR = join(USER_HOME, "Desktop", "WorkBuddy皮肤启动");
const VBS_PATH = join(LAUNCHER_DIR, "wb-skin-silent.vbs");
const STARTUP_DIR = join(ROAMING, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
const STARTUP_VBS = join(STARTUP_DIR, "wb-skin-silent.vbs");
const DESKTOP_LNK = join(USER_HOME, "Desktop", "WorkBuddy（带皮肤）.lnk");

const FALLBACK_THEME = "miku-light";
const PORT = Number(process.env.WB_SKIN_PORT || 9223);
const BOOT_TIMEOUT_MS = 60_000;

// ── 基础工具 ──────────────────────────────────────────────────

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(LOG_PATH, line, "utf8");
  } catch {
    /* 日志写不进去也不能影响主流程 */
  }
  process.stdout.write(line);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 定位 WorkBuddy.exe：环境变量优先，其次常见安装位置 */
function findWorkBuddy() {
  const candidates = [
    process.env.WORKBUDDY_EXE,
    join(LOCAL, "Programs", "workbuddy", "WorkBuddy.exe"),
    join(LOCAL, "workbuddy", "WorkBuddy.exe"),
    join(process.env.ProgramFiles || "", "WorkBuddy", "WorkBuddy.exe"),
    join(process.env["ProgramFiles(x86)"] || "", "WorkBuddy", "WorkBuddy.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

/** CDP 端点是否已经可用（通了就说明 WorkBuddy 是带调试端口跑的） */
async function cdpAlive(timeoutMs = 1500) {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/json/list`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function killWorkBuddy() {
  try {
    execFileSync("taskkill", ["/F", "/IM", "WorkBuddy.exe"], { stdio: "ignore" });
    return true;
  } catch {
    return false; // 没有进程时 taskkill 返回非 0，属正常
  }
}

/** 默认主题：环境变量 > 配置文件 > 内置兜底 */
function resolveTheme() {
  if (process.env.WB_SKIN_THEME) return process.env.WB_SKIN_THEME;
  try {
    const configured = readFileSync(THEME_CFG, "utf8").trim();
    if (configured) return configured;
  } catch {
    /* 首次运行还没有配置文件 */
  }
  return FALLBACK_THEME;
}

/** WSH 对 UTF-16LE+BOM 的脚本文件支持最好；纯 ASCII 路径也无法避免中文快捷方式名 */
function writeScriptFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, "utf16le")]));
}

// ── 核心流程 ──────────────────────────────────────────────────

/** 确保存在一个带调试端口的 WorkBuddy 实例；返回是否成功 */
async function ensureDebugInstance() {
  if (await cdpAlive()) {
    log("CDP 已就绪，跳过重启（直接重新注入）");
    return true;
  }

  const exe = findWorkBuddy();
  if (!exe) {
    log("ERROR 找不到 WorkBuddy.exe，可用 WORKBUDDY_EXE 环境变量指定");
    return false;
  }

  // 走到这里说明 WorkBuddy 要么没开，要么是不带调试端口的普通实例。
  // 后者必须终止才能以调试模式重启——这是"事后补救"无法避免的代价。
  if (killWorkBuddy()) {
    log("已终止不带调试端口的 WorkBuddy 实例");
    await sleep(2000);
  }

  log(`以调试模式启动：${exe} --remote-debugging-port=${PORT}`);
  // 用 cmd start 启动，让进程脱离本脚本的进程树（脚本退出后 WorkBuddy 继续运行）
  spawn("cmd", ["/c", "start", "", exe, `--remote-debugging-port=${PORT}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  let waited = 0;
  while (Date.now() < deadline) {
    await sleep(1000);
    waited += 1;
    if (await cdpAlive()) {
      log(`CDP 就绪（等待 ${waited}s）`);
      return true;
    }
  }
  log(`ERROR 等待 CDP 超时（${BOOT_TIMEOUT_MS / 1000}s）`);
  return false;
}

async function doBoot() {
  const theme = resolveTheme();
  log(`── boot 开始（主题 ${theme}，端口 ${PORT}）`);
  if (!(await ensureDebugInstance())) return 1;
  try {
    const { runCli } = await import("../studio/src/cli.mjs");
    const result = await runCli(["apply", "--theme", theme, "--port", String(PORT)]);
    log(`注入成功：applied=${result.applied} theme=${result.themeId} 菜单主题数=${result.menuThemes?.length ?? "?"}`);
    return 0;
  } catch (error) {
    log(`ERROR 注入失败：${error?.message || error}`);
    return 1;
  }
}

// ── 接线（install / enable / disable / status）─────────────────

function buildVbs() {
  const nodePath = process.execPath;
  const bootPath = fileURLToPath(import.meta.url);
  return [
    "' WorkBuddy 皮肤静默启动器",
    "' 由 wb-skin-boot.mjs install 生成；重跑 install 会覆盖，不要手改",
    "' 作用：无窗口调用 wb-skin-boot.mjs，探测 / 重启 / 注入皮肤",
    "Set ws = CreateObject(\"WScript.Shell\")",
    `ws.Run """${nodePath}"" ""${bootPath}""", 0, False`,
    "",
  ].join("\r\n");
}

function createShortcut() {
  const exe = findWorkBuddy();
  const wscript = join(SYSTEM_ROOT, "System32", "wscript.exe");
  const tmpVbs = join(STATE_DIR, "_mkshortcut.vbs");
  const lines = [
    "Set sh = CreateObject(\"WScript.Shell\")",
    `Set lnk = sh.CreateShortcut("${DESKTOP_LNK}")`,
    `lnk.TargetPath = "${wscript}"`,
    `lnk.Arguments = "//nologo ""${VBS_PATH}"""`,
    `lnk.WorkingDirectory = "${LAUNCHER_DIR}"`,
    exe ? `lnk.IconLocation = "${exe},0"` : null,
    "lnk.Description = \"WorkBuddy（带皮肤）\"",
    "lnk.Save",
    "",
  ].filter(Boolean);

  writeScriptFile(tmpVbs, lines.join("\r\n"));
  try {
    execFileSync("wscript", ["//nologo", tmpVbs], { stdio: "ignore" });
    return true;
  } catch (error) {
    log(`WARN 创建快捷方式失败：${error?.message || error}（可手动发送 VBS 到桌面）`);
    return false;
  } finally {
    rmSync(tmpVbs, { force: true });
  }
}

function cmdInstall() {
  mkdirSync(LAUNCHER_DIR, { recursive: true });
  writeScriptFile(VBS_PATH, buildVbs());
  log(`已生成静默启动器：${VBS_PATH}`);

  if (!existsSync(THEME_CFG)) {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(THEME_CFG, `${FALLBACK_THEME}\n`, "utf8");
    log(`已写入默认主题配置：${THEME_CFG}（改这个文件即可换默认主题）`);
  }

  const ok = createShortcut();
  if (ok) log(`已创建桌面快捷方式：${DESKTOP_LNK}`);
  return 0;
}

function cmdEnable() {
  if (!existsSync(VBS_PATH)) cmdInstall();
  copyFileSync(VBS_PATH, STARTUP_VBS);
  log(`已装入启动文件夹：${STARTUP_VBS}`);
  log("副作用：开机会自动启动 WorkBuddy（带皮肤）。若不想开机自启，跑 disable。");
  return 0;
}

function cmdDisable() {
  if (existsSync(STARTUP_VBS)) {
    rmSync(STARTUP_VBS, { force: true });
    log(`已从启动文件夹移除：${STARTUP_VBS}`);
  } else {
    log("启动文件夹里本来就没有本启动器");
  }
  return 0;
}

async function cmdStatus() {
  const exe = findWorkBuddy();
  const lines = [
    `WorkBuddy.exe    : ${exe || "未找到"}`,
    `默认主题         : ${resolveTheme()}`,
    `CDP 端口         : ${PORT} → ${(await cdpAlive()) ? "已就绪（WorkBuddy 正以调试模式运行）" : "未就绪"}`,
    `静默启动器       : ${existsSync(VBS_PATH) ? VBS_PATH : "未生成（跑 install）"}`,
    `桌面快捷方式     : ${existsSync(DESKTOP_LNK) ? DESKTOP_LNK : "未创建"}`,
    `开机自启         : ${existsSync(STARTUP_VBS) ? "已启用" : "未启用"}`,
    `日志             : ${LOG_PATH}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

// ── 入口 ──────────────────────────────────────────────────────

const command = process.argv[2] || "boot";

const handlers = {
  boot: doBoot,
  install: cmdInstall,
  enable: cmdEnable,
  disable: cmdDisable,
  status: cmdStatus,
};

const handler = handlers[command];
if (!handler) {
  process.stderr.write(`未知子命令：${command}（可用：boot / install / enable / disable / status）\n`);
  process.exit(2);
}

process.exit(await handler());
