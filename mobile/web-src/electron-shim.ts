// =============================================================================
//  Browser shim for Electron's `ipcRenderer`, aliased in at bundle time so the
//  UNMODIFIED desktop renderer (main.ts / login.ts) runs in the phone browser.
//
//  The desktop main process (src/index.ts) is an almost pure 1:1 pass-through
//  for agent-facing channels: `ipcMain.on("X", (...a) => script.post(["X",
//  ...a]))`. So here we forward `ipcRenderer.send("X", ...a)` straight to the
//  agent as `["X", ...a]` over POST /cmd, and route agent `send([...])`
//  (delivered via SSE /events) back to `ipcRenderer.on` listeners.
//
//  PC-only channels (ADB / Frida / cookie / updater / layout window) have no
//  meaning on a rooted phone — the agent is already injected by launch.sh —
//  so they are swallowed.
// =============================================================================

type Listener = (event: any, ...args: any[]) => void;

const listeners: { [channel: string]: Listener[] } = {};

// Channels that exist only in the desktop Electron host. No-op on phone.
const SWALLOW = new Set<string>([
  'serial', 'connect-adb', 'connect-serial', 'start-server', 'download-server',
  'upload-server', 'connect-frida', 'get-cookie', 'start-agent', 'cookie',
  'open-web', 'show-layout', 'lock-layout', 'resize-layout', 'get-config',
  'get-macros', 'search-wp', 'console-cmd', 'server-start', 'log',
]);

const LS = {
  get(k: string, d: any) {
    try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch { return d; }
  },
  set(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Mirrors what src/index.ts keeps and posts to the agent on (re)attach.
let cheats: { [k: string]: boolean } = LS.get('cheats', {});
let keybinds: { [k: string]: string } = LS.get('keybinds', {});
let config: { [k: string]: any } = LS.get('config', {});
let wpdata: any[] = LS.get('wpdata', []);
let connected = false;

function postCmd(arr: any[]) {
  fetch('/cmd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arr),
  }).catch(() => {});
}

function emit(channel: string, ...args: any[]) {
  (listeners[channel] || []).slice().forEach((fn) => {
    try { fn({}, ...args); } catch (e) { /* keep other listeners alive */ }
  });
}

function sendAgentInit() {
  // Exactly src/index.ts: script.post(['init', cheats, keybinds, config, wpdata])
  postCmd(['init', cheats, keybinds, config, wpdata]);
}

const ipcRenderer = {
  send(channel: string, ...args: any[]) {
    // Track state the desktop host would have tracked.
    if (channel === 'cheats') { cheats[args[0]] = args[1]; LS.set('cheats', cheats); }
    else if (channel === 'keybind') { keybinds[args[0]] = args[1]; LS.set('keybinds', keybinds); }
    else if (channel === 'config') { config[args[0]] = args[1]; LS.set('config', config); }
    else if (channel === 'lang') { config['lang'] = args[0]; LS.set('config', config); return; }
    else if (channel === 'init') {
      // renderer -> host signature: (keybinds, config, wpdata, layoutBounds)
      keybinds = args[0] || keybinds;
      config = args[1] || config;
      wpdata = args[2] || wpdata;
      LS.set('keybinds', keybinds); LS.set('config', config); LS.set('wpdata', wpdata);
      if (connected) sendAgentInit();
      return;
    }
    if (SWALLOW.has(channel)) return;
    postCmd([channel, ...args]);
  },

  on(channel: string, fn: Listener) {
    (listeners[channel] || (listeners[channel] = [])).push(fn);
    return ipcRenderer;
  },
  once(channel: string, fn: Listener) {
    const wrap: Listener = (e, ...a) => {
      ipcRenderer.removeListener(channel, wrap);
      fn(e, ...a);
    };
    return ipcRenderer.on(channel, wrap);
  },
  removeListener(channel: string, fn: Listener) {
    const l = listeners[channel];
    if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
    return ipcRenderer;
  },
  removeAllListeners(channel?: string) {
    if (channel) delete listeners[channel]; else for (const k in listeners) delete listeners[k];
    return ipcRenderer;
  },

  invoke(channel: string, ..._args: any[]): Promise<any> {
    // Only auth:login is invoke()d (login.ts). No auth backend on a phone you
    // physically hold — accept and enter.
    if (channel === 'auth:login') return Promise.resolve({ ok: true });
    return Promise.resolve(undefined);
  },
  sendSync(channel: string): any {
    if (channel === 'get-config') return config;
    return undefined;
  },
};

// ---- live link to the in-agent server (src/server.js) --------------------
function connect() {
  const es = new EventSource('/events');
  es.onopen = () => {
    if (connected) return;
    connected = true;
    sendAgentInit();          // re-apply state to the (re)attached agent
    emit('init', true);       // main.ts: enables all .toggle / .attached controls
  };
  es.onmessage = (ev: MessageEvent) => {
    let m: any;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (!m || m.__pixel !== 'send' || !Array.isArray(m.payload)) return;
    const [ch, ...rest] = m.payload;
    emit(ch, ...rest);        // agent send(['log',...]) -> ipcRenderer.on('log')
  };
  es.onerror = () => {
    if (connected) { connected = false; emit('init', false); }
    // EventSource auto-reconnects; onopen will re-init.
  };
}

// Called by boot.ts after login.ts + main.ts have registered their listeners.
export function __pixelBoot() {
  emit('updater-done');       // login.ts: render the login form
  emit('enter');              // skip the (nonexistent) web auth: reveal the app
  connect();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

export { ipcRenderer };
export default { ipcRenderer };
