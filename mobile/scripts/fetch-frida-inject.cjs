#!/usr/bin/env node
/**
 * Downloads + decompresses `frida-inject` for every Android ABI into bin/.
 * That binary injects the agent on the phone itself (root) with no PC.
 * Idempotent: present files of sane size are left alone.
 */
const fs = require('fs');
const path = require('path');
const { XzReadableStream } = require('xz-decompress');

const FRIDA_VERSION = '16.4.10';
const ARCHES = ['arm', 'arm64', 'x86', 'x86_64'];
const BIN = path.join(__dirname, '..', 'bin');

const name = (a) => `frida-inject-${FRIDA_VERSION}-android-${a}`;
const url = (a) =>
  `https://github.com/frida/frida/releases/download/${FRIDA_VERSION}/${name(a)}.xz`;

async function fetchXz(u) {
  const res = await fetch(u, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${u}`);
  return Buffer.from(await new Response(new XzReadableStream(res.body)).arrayBuffer());
}

(async () => {
  try {
    fs.mkdirSync(BIN, { recursive: true });
    for (const a of ARCHES) {
      const dest = path.join(BIN, name(a));
      try { if (fs.statSync(dest).size >= 100_000) { console.log(`[fetch] ${name(a)} present, skip`); continue; } } catch {}
      console.log(`[fetch] ${name(a)} ...`);
      const buf = await fetchXz(url(a));
      if (buf.subarray(0, 4).toString('hex') !== '7f454c46')
        throw new Error(`${name(a)} is not an ELF binary`);
      fs.writeFileSync(dest, buf);
      console.log(`[fetch]   wrote ${name(a)} (${buf.length} bytes)`);
    }
    console.log('[fetch] done');
  } catch (e) {
    console.error('[fetch] FAILED:', e.message);
    process.exit(1);
  }
})();
