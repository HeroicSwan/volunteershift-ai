const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { requestProposals } = require("./ai-bridge.cjs");

// Directory holding the static Next.js export (created by `npm run build:desktop`).
const OUT_DIR = path.join(__dirname, "..", "out");
// When set (e.g. ELECTRON_START_URL=http://localhost:3000), load the live dev
// server instead of the packaged export — handy while developing.
const DEV_URL = process.env.ELECTRON_START_URL;
// Brand oat/sand background so there's no white flash before the app paints.
const BRAND_BACKGROUND = "#d4b895";
const AI_CREDENTIALS_FILE = "ai-credentials.json";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: BRAND_BACKGROUND,
    title: "VolunteerShift AI",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => win.show());

  // Open real web links in the user's browser; keep app navigation internal.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const internal = url.startsWith("app://") || (DEV_URL && url.startsWith(DEV_URL));
    if (!internal) {
      event.preventDefault();
      if (url.startsWith("http:") || url.startsWith("https:")) shell.openExternal(url);
    }
  });

  win.loadURL(DEV_URL || "app://local/");
}

function isTrustedRenderer(event) {
  const url = event.senderFrame?.url || "";
  return url.startsWith("app://local/") || Boolean(DEV_URL && url.startsWith(DEV_URL));
}

function credentialsPath() {
  return path.join(app.getPath("userData"), AI_CREDENTIALS_FILE);
}

function readStoredAiCredentials() {
  if (!safeStorage.isEncryptionAvailable()) return undefined;
  try {
    const stored = JSON.parse(fs.readFileSync(credentialsPath(), "utf8"));
    if (typeof stored.encryptedApiKey !== "string") return undefined;
    return {
      apiKey: safeStorage.decryptString(Buffer.from(stored.encryptedApiKey, "base64")),
      baseUrl: typeof stored.baseUrl === "string" ? stored.baseUrl : undefined,
      model: typeof stored.model === "string" ? stored.model : undefined,
    };
  } catch {
    return undefined;
  }
}

function aiConfigStatus() {
  const stored = readStoredAiCredentials();
  return {
    configured: Boolean(stored?.apiKey || process.env.OPENAI_API_KEY),
    secureStorageAvailable: safeStorage.isEncryptionAvailable(),
    baseUrl: stored?.baseUrl || process.env.OPENAI_BASE_URL || "",
    model: stored?.model || process.env.OPENAI_MODEL || "gpt-5.4-mini",
  };
}

function saveAiCredentials(payload) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable on this device.");
  const apiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
  if (apiKey.length < 10 || apiKey.length > 500) throw new Error("Enter a valid API key.");
  const baseUrl = typeof payload?.baseUrl === "string" ? payload.baseUrl.trim().slice(0, 500) : "";
  const model = typeof payload?.model === "string" ? payload.model.trim().slice(0, 120) : "";
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(credentialsPath(), JSON.stringify({
    encryptedApiKey: safeStorage.encryptString(apiKey).toString("base64"),
    baseUrl,
    model,
  }), { encoding: "utf8", mode: 0o600 });
  return aiConfigStatus();
}

function clearAiCredentials() {
  try { fs.unlinkSync(credentialsPath()); } catch {}
  return aiConfigStatus();
}

app.whenReady().then(() => {
  ipcMain.handle("generate-schedule", async (event, payload) => {
    if (!isTrustedRenderer(event)) throw new Error("Untrusted renderer");
    if (!payload || !Array.isArray(payload.workers) || !Array.isArray(payload.shifts)) {
      throw new Error("Workers and shifts are required");
    }
    return requestProposals(payload.workers, payload.shifts, readStoredAiCredentials() || {});
  });

  ipcMain.handle("get-ai-config", (event) => {
    if (!isTrustedRenderer(event)) throw new Error("Untrusted renderer");
    return aiConfigStatus();
  });

  ipcMain.handle("save-ai-config", (event, payload) => {
    if (!isTrustedRenderer(event)) throw new Error("Untrusted renderer");
    return saveAiCredentials(payload);
  });

  ipcMain.handle("clear-ai-config", (event) => {
    if (!isTrustedRenderer(event)) throw new Error("Untrusted renderer");
    return clearAiCredentials();
  });

  if (!DEV_URL) {
    // Serve the static export. Absolute asset paths like /_next/... resolve
    // under app://local, and trailing-slash routes map to their index.html.
    protocol.handle("app", (request) => {
      let rel = decodeURIComponent(new URL(request.url).pathname);
      if (rel.endsWith("/")) rel += "index.html";
      else if (!path.extname(rel)) rel += "/index.html";
      const filePath = path.join(OUT_DIR, rel);
      if (!filePath.startsWith(OUT_DIR)) {
        return new Response("Forbidden", { status: 403 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    });
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
