#!/usr/bin/env node
/**
 * Bundles the desktop renderer (web-src/main.ts + login.ts) for the phone
 * browser, with Electron's `ipcRenderer` aliased to the SSE/POST shim. Also
 * prepares the HTML shell + CSS. Output -> build/web/ (embedded by build.cjs).
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'web-src');
const OUT = path.join(ROOT, 'build', 'web');

fs.mkdirSync(OUT, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(SRC, 'boot.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2018'],
  minify: true,
  legalComments: 'none',
  outfile: path.join(OUT, 'renderer.js'),
  banner: { js: 'globalThis.process=globalThis.process||{env:{}};globalThis.global=globalThis;' },
  define: { 'process.env.NODE_ENV': '"production"' },
  tsconfigRaw: { compilerOptions: { useDefineForClassFields: false } },
  alias: {
    electron: path.join(SRC, 'electron-shim.ts'),
    'node-global-key-listener': path.join(SRC, 'node-global-key-listener.ts'),
  },
});

// CSS straight through (already Tailwind-built).
fs.copyFileSync(path.join(SRC, 'output.css'), path.join(OUT, 'output.css'));

// HTML shell: desktop main.html + PWA meta + manifest. The renderer/css are
// served at the site root by the in-agent server, so absolute paths are fine.
let html = fs.readFileSync(path.join(SRC, 'main.html'), 'utf8');
const headInject =
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '<meta name="theme-color" content="#0b0d12">\n' +
  '<meta name="mobile-web-app-capable" content="yes">\n' +
  '<meta name="apple-mobile-web-app-capable" content="yes">\n' +
  '<link rel="manifest" href="/manifest.webmanifest">\n' +
  '<link rel="icon" href="/icon.svg">\n';
html = html.replace(/<head>/i, '<head>\n' + headInject);
html = html.replace(/\.\/output\.css/g, '/output.css').replace(/\.\/renderer\.js/g, '/renderer.js');
fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');

const kb = (fs.statSync(path.join(OUT, 'renderer.js')).size / 1024).toFixed(0);
console.log(`[build-web] renderer.js ${kb} KB, index.html + output.css ready`);
