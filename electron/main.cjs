const { app, BrowserWindow, protocol, net, shell, Menu } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// Directory holding the static Next.js export (created by `npm run build:desktop`).
const OUT_DIR = path.join(__dirname, "..", "out");
// When set (e.g. ELECTRON_START_URL=http://localhost:3000), load the live dev
// server instead of the packaged export — handy while developing.
const DEV_URL = process.env.ELECTRON_START_URL;
// Brand oat/sand background so there's no white flash before the app paints.
const BRAND_BACKGROUND = "#d4b895";

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

app.whenReady().then(() => {
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
