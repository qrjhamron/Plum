'use strict';
const fs = require('fs');
const path = require('path');
const { verifySha1 } = require('./store');

/**
 * Unduh dengan resume (.part + Range), verifikasi SHA-1, retry.
 * onProgress(downloaded, total)
 */
async function downloadFile({ url, dest, sha1 = null, size = null, onProgress, signal }) {
  if (sha1 && (await verifySha1(dest, sha1))) { onProgress && onProgress(size || fs.statSync(dest).size, size || fs.statSync(dest).size); return { skipped: true }; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = dest + '.part';
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let offset = fs.existsSync(part) ? fs.statSync(part).size : 0;
      if (size && offset >= size) offset = 0;
      if (offset > 0 && !sha1) { /* tetap resume */ }
      const headers = { 'user-agent': 'PlumCraft-Launcher/1.0' };
      if (offset > 0) headers.Range = `bytes=${offset}-`;
      const res = await fetch(url, { headers, signal, redirect: 'follow' });
      if (res.status === 416) { fs.unlinkSync(part); continue; }
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status} untuk ${url}`);
      const total = size || (offset + Number(res.headers.get('content-length') || 0)) || null;
      const canResume = res.status === 206;
      const out = fs.createWriteStream(part, { flags: canResume ? 'a' : 'w' });
      let downloaded = canResume ? offset : 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        downloaded += value.byteLength;
        if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
        onProgress && onProgress(downloaded, total);
      }
      await new Promise((r, j) => { out.end(r); out.on('error', j); });
      fs.renameSync(part, dest);
      if (sha1 && !(await verifySha1(dest, sha1))) {
        fs.unlinkSync(dest);
        throw new Error('SHA-1 tidak cocok, file dihapus: ' + path.basename(dest));
      }
      return { skipped: false };
    } catch (e) {
      lastErr = e;
      if (signal && signal.aborted) throw e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastErr || new Error('Unduhan gagal: ' + url);
}

/** Jalan paralel terbatas dengan agregasi progres. */
async function downloadMany(items, { concurrency = 8, onProgress } = {}) {
  let done = 0, bytes = 0;
  const totalBytes = items.reduce((a, i) => a + (i.size || 0), 0);
  let idx = 0; const errors = [];
  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      try {
        let last = 0;
        await downloadFile({ ...item, onProgress: (d) => { bytes += d - last; last = d; onProgress && onProgress({ done, total: items.length, bytes, totalBytes }); } });
      } catch (e) { errors.push({ url: item.url, error: e.message }); }
      done++; onProgress && onProgress({ done, total: items.length, bytes, totalBytes });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, worker));
  if (errors.length) { const e = new Error(`${errors.length} unduhan gagal. Contoh: ${errors[0].error}`); e.errors = errors; throw e; }
}
module.exports = { downloadFile, downloadMany };
