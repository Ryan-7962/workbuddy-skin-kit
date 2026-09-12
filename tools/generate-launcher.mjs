#!/usr/bin/env node
/**
 * generate-launcher.mjs — 生成 WorkBuddy 皮肤启动器（cmd + vbs，CRLF 格式保证）
 *
 * 用法:
 *   node generate-launcher.mjs --theme-id <id> [--studio-dir <dir>] [--out-dir <dir>] [--port 9223]
 *
 * 输出（默认在桌面创建「WorkBuddy皮肤启动」文件夹）:
 *   启动WorkBuddy-注入皮肤.cmd   主流程：杀进程 → 调试模式启动 → 等待渲染 → 注入主题
 *   wb-launch.vbs               脱离控制台启动器（防止关闭 cmd 窗口时连坐杀死 WorkBuddy）
 *
 * 关键设计（来自实战经验，勿删）:
 *   1. 批处理必须 CRLF 换行 —— LF 会导致 cmd 把 echo/timeout/start 等命令切碎报错
 *   2. WorkBuddy 必须经 vbs 的 WScript.Shell.Run 启动以脱离控制台进程组
 *   3. node 路径取 process.execPath（运行本脚本的那个 node），不写死
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const themeId = arg("theme-id", null);
if (!themeId) {
  console.error("ERROR: 缺少 --theme-id <id>（先运行 cli.mjs create 获取）");
  process.exit(1);
}

const studioDir = arg("studio-dir", path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "studio"));
const port = arg("port", "9223");
const home = os.homedir();
const outDir = arg("out-dir", path.join(home, "Desktop", "WorkBuddy皮肤启动"));
const wbPath = process.env.WORKBUDDY_EXE || path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Programs", "workbuddy", "WorkBuddy.exe");
const nodePath = process.execPath;

if (!fs.existsSync(wbPath)) {
  console.error(`ERROR: 未找到 WorkBuddy.exe: ${wbPath}`);
  console.error("请确认已安装 WorkBuddy 桌面版，或用环境变量 WORKBUDDY_EXE 指定路径。");
  process.exit(1);
}
if (!fs.existsSync(path.join(studioDir, "src", "cli.mjs"))) {
  console.error(`ERROR: studio 目录无效（缺少 src/cli.mjs）: ${studioDir}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// ---------- cmd（每行显式 \r\n）----------
const cmdLines = [
  "@echo off",
  "title WorkBuddy Skin Launcher",
  `set "WB_PATH=${wbPath}"`,
  `set "SKIN_DIR=${studioDir}"`,
  `set "NODE=${nodePath}"`,
  `set "THEME_ID=${themeId}"`,
  `set "CDP_PORT=${port}"`,
  "",
  "echo ============================================",
  "echo  WorkBuddy Skin Launcher",
  `echo  Theme: ${themeId}`,
  "echo ============================================",
  "echo.",
  "",
  "echo [1/4] Killing existing WorkBuddy processes...",
  "taskkill /F /IM WorkBuddy.exe >nul 2>&1",
  "timeout /t 2 /nobreak >nul",
  "",
  "echo [2/4] Starting WorkBuddy in CDP debug mode (port %CDP_PORT%)...",
  'if not exist "%WB_PATH%" (',
  "    echo [ERROR] WorkBuddy.exe not found: %WB_PATH%",
  "    pause",
  "    exit /b 1",
  ")",
  'wscript //nologo "%~dp0wb-launch.vbs"',
  "",
  "echo [3/4] Waiting for renderer on port %CDP_PORT%...",
  "set RETRY=0",
  ":wait_loop",
  "curl -s --max-time 2 http://127.0.0.1:%CDP_PORT%/json/list >nul 2>&1",
  "if %errorlevel% equ 0 goto renderer_ready",
  "set /a RETRY+=1",
  "if %RETRY% geq 20 (",
  "    echo [ERROR] Renderer not ready after 40 seconds. Aborting.",
  "    pause",
  "    exit /b 1",
  ")",
  "timeout /t 2 /nobreak >nul",
  "goto wait_loop",
  "",
  ":renderer_ready",
  "echo Renderer detected.",
  "",
  "echo [4/4] Injecting theme %THEME_ID%...",
  'cd /d "%SKIN_DIR%"',
  '"%NODE%" src\\cli.mjs apply --theme %THEME_ID% --port %CDP_PORT%',
  "",
  "if %errorlevel% equ 0 (",
  "    echo.",
  "    echo ============================================",
  "    echo  SUCCESS: Theme injected!",
  "    echo  Palette button is in WorkBuddy top-right (draggable).",
  "    echo  You can close this window - WorkBuddy will keep running.",
  "    echo ============================================",
  ") else (",
  "    echo.",
  "    echo [ERROR] Theme injection failed.",
  ")",
  "",
  "echo.",
  "pause",
  "",
];

const vbsLines = [
  'Set ws = CreateObject("WScript.Shell")',
  `ws.Run """${wbPath}"" --remote-debugging-port=${port}", 1, False`,
  "",
];

const cmdFile = path.join(outDir, "启动WorkBuddy-注入皮肤.cmd");
const vbsFile = path.join(outDir, "wb-launch.vbs");
fs.writeFileSync(cmdFile, cmdLines.join("\r\n"), "ascii");
fs.writeFileSync(vbsFile, vbsLines.join("\r\n"), "ascii");

// 自检：CRLF 完整性
const check = (f) => {
  const buf = fs.readFileSync(f);
  const lines = buf.toString("ascii").split("\n").length - 1;
  const crs = buf.filter((b) => b === 13).length;
  return lines === crs;
};
if (!check(cmdFile) || !check(vbsFile)) {
  console.error("ERROR: CRLF 自检失败（存在 LF-only 行）");
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  outDir,
  files: [cmdFile, vbsFile],
  themeId,
  nodePath,
  wbPath,
  note: "两个文件必须在同一文件夹。引导用户双击 cmd；Agent 不要代跑（会结束当前会话）。",
}, null, 2));
