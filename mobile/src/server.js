// =============================================================================
//  Pixel Mobile — in-agent HTTP/SSE bridge
//
//  Prepended (by mobile/build.cjs) to the UNMODIFIED compiled desktop agent.
//  The desktop agent talks to its host purely through the Frida globals
//  `send(payload[, data])` and `recv([type,] callback)`. Here we shadow those
//  globals so the exact same agent code instead talks to a phone browser:
//
//    agent  --send()-->  SSE  /events   -->  phone UI
//    phone UI  --POST /cmd-->  recv()    -->  agent
//
//  No PC, no Node, no Termux. The web server runs *inside the game process*
//  using Frida's own Socket API. Injection is done on-device by `frida-inject`
//  (root). See mobile/README.md.
//
//  Web assets are injected as a string map by the build step:
//      const __PIXEL_WEB__ = { "/index.html": "...", ... }
// =============================================================================
/* global Socket */
(function () {
  'use strict';

  var PORT = 27345;

  // ---- tiny UTF-8 (don't assume TextEncoder exists in the Frida runtime) ----
  function utf8Encode(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
                 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return new Uint8Array(out).buffer;
  }
  function utf8Decode(buf) {
    var b = new Uint8Array(buf), s = '', i = 0;
    while (i < b.length) {
      var c = b[i++];
      if (c < 0x80) { s += String.fromCharCode(c); }
      else if (c < 0xe0) { s += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f)); }
      else if (c < 0xf0) { s += String.fromCharCode(((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f)); }
      else {
        var cp = ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
        cp -= 0x10000;
        s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      }
    }
    return s;
  }
  function concatBuf(a, b) {
    var r = new Uint8Array(a.byteLength + b.byteLength);
    r.set(new Uint8Array(a), 0);
    r.set(new Uint8Array(b), a.byteLength);
    return r.buffer;
  }
  function indexOfCRLF2(buf) {
    var b = new Uint8Array(buf);
    for (var i = 0; i + 3 < b.length; i++) {
      if (b[i] === 13 && b[i + 1] === 10 && b[i + 2] === 13 && b[i + 3] === 10) return i;
    }
    return -1;
  }

  // ---------------------------- send / recv shim ----------------------------
  var sseClients = [];          // open SSE SocketConnections (phone UIs)
  var recvHandlers = [];        // pending recv() callbacks (FIFO, Frida-like)
  var inbox = [];               // messages from UI awaiting a recv handler

  function broadcast(obj) {
    var line = 'data: ' + JSON.stringify(obj) + '\n\n';
    var payload = utf8Encode(line);
    for (var i = sseClients.length - 1; i >= 0; i--) {
      var conn = sseClients[i];
      try {
        conn.output.writeAll(payload).catch(function () { dropClient(conn); });
      } catch (e) { dropClient(conn); }
    }
  }
  function dropClient(conn) {
    var idx = sseClients.indexOf(conn);
    if (idx >= 0) sseClients.splice(idx, 1);
    try { conn.close(); } catch (e) {}
  }

  // Frida-compatible: send(payload[, data]). `data` (ArrayBuffer) is rare in
  // this agent; forward it base64-tagged so nothing is silently lost.
  globalThis.send = function (payload, data) {
    var env = { __pixel: 'send', payload: payload };
    if (data) {
      var u = new Uint8Array(data), bin = '';
      for (var i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
      env.data = (typeof btoa === 'function') ? btoa(bin) : null;
    }
    broadcast(env);
  };

  function deliver(msg) {
    // Frida semantics: each recv() handler consumes exactly one message, FIFO.
    while (recvHandlers.length) {
      var h = recvHandlers[0];
      if (h.type == null || h.type === msg || (msg && msg[0] === h.type)) {
        recvHandlers.shift();
        try { h.cb(msg); } catch (e) { reportError(e); }
        return;
      }
      // Type-filtered handler that doesn't match: stop (Frida would keep it).
      break;
    }
    inbox.push(msg);
  }

  // Frida-compatible: recv(callback) or recv(type, callback).
  globalThis.recv = function (a, b) {
    var type = (typeof a === 'string') ? a : null;
    var cb = (typeof a === 'function') ? a : b;
    if (typeof cb !== 'function') return { wait: function () {} };
    // Satisfy immediately from a queued message if one matches.
    for (var i = 0; i < inbox.length; i++) {
      var m = inbox[i];
      if (type == null || type === m || (m && m[0] === type)) {
        inbox.splice(i, 1);
        try { cb(m); } catch (e) { reportError(e); }
        return { wait: function () {} };
      }
    }
    recvHandlers.push({ type: type, cb: cb });
    return { wait: function () {} };
  };

  function reportError(e) {
    try { broadcast({ __pixel: 'send', payload: ['log', 'agent-error', String(e && e.stack || e)] }); } catch (_) {}
  }

  // ------------------------------- HTTP server ------------------------------
  function mime(p) {
    if (/\.html?$/.test(p)) return 'text/html; charset=utf-8';
    if (/\.js$/.test(p)) return 'application/javascript; charset=utf-8';
    if (/\.css$/.test(p)) return 'text/css; charset=utf-8';
    if (/\.webmanifest$/.test(p)) return 'application/manifest+json; charset=utf-8';
    if (/\.json$/.test(p)) return 'application/json; charset=utf-8';
    if (/\.svg$/.test(p)) return 'image/svg+xml';
    return 'text/plain; charset=utf-8';
  }
  function writeResponse(conn, status, headers, bodyBuf) {
    var head = 'HTTP/1.1 ' + status + '\r\n';
    headers = headers || {};
    if (bodyBuf && headers['Content-Length'] == null) headers['Content-Length'] = bodyBuf.byteLength;
    headers['Connection'] = headers['Connection'] || 'close';
    for (var k in headers) head += k + ': ' + headers[k] + '\r\n';
    head += '\r\n';
    var out = bodyBuf ? concatBuf(utf8Encode(head), bodyBuf) : utf8Encode(head);
    return conn.output.writeAll(out);
  }

  function readRequest(conn) {
    // Returns { method, path, headers, body } or null on EOF/parse failure.
    var acc = new ArrayBuffer(0);
    function pump() {
      return conn.input.read(8192).then(function (chunk) {
        if (!chunk || chunk.byteLength === 0) return null;
        acc = concatBuf(acc, chunk);
        var sep = indexOfCRLF2(acc);
        if (sep < 0) {
          if (acc.byteLength > 1 << 20) return null;
          return pump();
        }
        var headText = utf8Decode(acc.slice(0, sep));
        var lines = headText.split('\r\n');
        var first = lines[0].split(' ');
        var headers = {};
        for (var i = 1; i < lines.length; i++) {
          var c = lines[i].indexOf(':');
          if (c > 0) headers[lines[i].slice(0, c).trim().toLowerCase()] = lines[i].slice(c + 1).trim();
        }
        var req = { method: first[0], path: first[1] || '/', headers: headers };
        var bodyStart = sep + 4;
        var have = acc.byteLength - bodyStart;
        var need = parseInt(headers['content-length'] || '0', 10) || 0;
        var bodyAcc = acc.slice(bodyStart);
        function pumpBody() {
          if (bodyAcc.byteLength >= need) {
            req.body = utf8Decode(bodyAcc.slice(0, need));
            return req;
          }
          return conn.input.read(8192).then(function (more) {
            if (!more || more.byteLength === 0) { req.body = utf8Decode(bodyAcc); return req; }
            bodyAcc = concatBuf(bodyAcc, more);
            return pumpBody();
          });
        }
        return (have >= need) ? (function () { req.body = utf8Decode(bodyAcc.slice(0, need)); return req; })() : pumpBody();
      });
    }
    return pump();
  }

  function handle(conn) {
    readRequest(conn).then(function (req) {
      if (!req) { try { conn.close(); } catch (e) {} return; }
      var path = req.path.split('?')[0];

      if (req.method === 'GET' && path === '/events') {
        return writeResponse(conn, '200 OK', {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        }).then(function () {
          sseClients.push(conn);
          conn.output.writeAll(utf8Encode('retry: 1500\n\n')).catch(function () { dropClient(conn); });
        }).catch(function () { dropClient(conn); });
      }

      if (req.method === 'POST' && path === '/cmd') {
        var ok = false;
        try {
          var msg = JSON.parse(req.body || 'null');
          if (msg != null) { deliver(msg); ok = true; }
        } catch (e) {}
        return writeResponse(conn, ok ? '204 No Content' : '400 Bad Request',
          { 'Access-Control-Allow-Origin': '*' }).then(function () {
            try { conn.close(); } catch (e) {}
          });
      }

      // static
      if (req.method === 'GET') {
        var key = (path === '/') ? '/index.html' : path;
        var asset = (typeof __PIXEL_WEB__ !== 'undefined') ? __PIXEL_WEB__[key] : null;
        if (asset != null) {
          return writeResponse(conn, '200 OK',
            { 'Content-Type': mime(key) }, utf8Encode(asset))
            .then(function () { try { conn.close(); } catch (e) {} });
        }
      }

      writeResponse(conn, '404 Not Found', {}, utf8Encode('not found'))
        .then(function () { try { conn.close(); } catch (e) {} });
    }).catch(function () { try { conn.close(); } catch (e) {} });
  }

  function acceptLoop(listener) {
    listener.accept().then(function (conn) {
      try { conn.setNoDelay(true); } catch (e) {}
      handle(conn);
      acceptLoop(listener);
    }).catch(function (e) {
      // Listener closed or transient error — keep the agent alive regardless.
    });
  }

  Socket.listen({ port: PORT, backlog: 16 }).then(function (listener) {
    acceptLoop(listener);
  }).catch(function (e) {
    // Port busy => a previous injection is still bound. The agent (cheats)
    // still works; only the UI bridge is unavailable. Surface it on stderr.
    try { console.error('[pixel-mobile] Socket.listen failed: ' + e); } catch (_) {}
  });
})();
