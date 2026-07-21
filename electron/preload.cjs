const { contextBridge, ipcRenderer } = require("electron");

// Keep the renderer on a narrow, typed surface. The API key and OpenAI client
// remain in the Electron main process; pages only receive proposal data.
contextBridge.exposeInMainWorld("volunteerShiftDesktop", {
  generateSchedule: (payload) => ipcRenderer.invoke("generate-schedule", payload),
  getAiConfig: () => ipcRenderer.invoke("get-ai-config"),
  saveAiConfig: (payload) => ipcRenderer.invoke("save-ai-config", payload),
  clearAiConfig: () => ipcRenderer.invoke("clear-ai-config"),
});
