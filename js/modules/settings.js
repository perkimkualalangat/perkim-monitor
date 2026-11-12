import { state } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, fmtDateTime, fmtBytes, fmtNumber,
  showToast, downloadJSON, statusBadge,
} from '../core/ui.js';

export async function render(root) {
  const s = state.status;
  const config = state.config;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const meta = s.meta || {};
  const dbFiles = state.dbIndex?.files || [];
  const lighthousePages = config?.lighthouse?.halaman || [];
  const categories = config?.lighthouse?.kategori || [];

  root.innerHTML = `
    ${pageHead(
      'Tetapan & maklumat sistem',
      'Konfigurasi audit, sumber data dan arahan penyelenggaraan dashboard.',
      `<button class="btn btn--ghost btn--sm" type="button" id="settings-theme">${icon('moon', 14)} Tukar tema</button>
       <button class="btn btn--primary btn--sm" type="button" id="settings-export">${icon('download', 14)} Eksport semua data</button>`,
    )}

    <section class="settings-grid">
      <article class="card">
        ${cardHead('Laman dipantau', 'Maklumat asas website')}
        <dl class="kv">
          <dt>Nama</dt><dd>${esc(s.site?.name || '—')}</dd>
          <dt>Nama pendek</dt><dd>${esc(s.site?.short_name || '—')}</dd>
          <dt>URL live</dt><dd><a href="${esc(s.site?.url || '#')}" target="_blank" rel="noopener">${esc(s.site?.url || '—')}</a></dd>
          <dt>Repo website</dt><dd><a href="https://github.com/${esc(s.site?.repo || '')}" target="_blank" rel="noopener">${esc(s.site?.repo || '—')}</a></dd>
          <dt>Branch</dt><dd class="mono">${esc(s.site?.branch || '—')}</dd>
          <dt>Fasa</dt><dd>${statusBadge(s.site?.phase === 'live' ? 'pass' : 'warn', s.site?.phase || '—')}</dd>
          <dt>R2</dt><dd class="mono">${esc(s.site?.r2 || '—')}</dd>
          <dt>Commit</dt><dd class="mono">${esc(s.site?.sha || '—')}</dd>
        </dl>
      </article>

      <article class="card">
        ${cardHead('Ambang audit', 'Had amaran yang digunakan')}
        <dl class="kv">
          <dt>Masa respons</dt><dd>${esc(config?.ambang?.masa_ms ?? 2500)} ms</dd>
          <dt>Saiz HTML</dt><dd>${esc(config?.ambang?.html_kb ?? 300)} KB</dd>
          <dt>Saiz gambar</dt><dd>${esc(config?.ambang?.gambar_kb ?? 500)} KB</dd>
          <dt>Timeout</dt><dd>${esc(config?.audit?.timeout_ms ?? 15000)} ms</dd>
          <dt>Pautan dalaman</dt><dd>Maksimum ${esc(config?.audit?.max_internal_links ?? 80)}</dd>
          <dt>Pautan luaran</dt><dd>Maksimum ${esc(config?.audit?.max_external_links ?? 60)}</dd>
          <dt>Konkurensi</dt><dd>${esc(config?.audit?.concurrency ?? 6)}</dd>
          <dt>Lighthouse</dt><dd>${meta.lighthouse_enabled ? statusBadge('pass', 'Aktif') : statusBadge('warn', 'Dilangkau')}</dd>
        </dl>
      </article>

      <article class="card">
        ${cardHead('Lighthouse', 'Halaman dan kategori yang diuji')}
        <div class="small muted" style="margin-bottom:6px">Halaman:</div>
        <div class="pill-list">${lighthousePages.map((page) => `<span class="pill">${esc(page || '/')}</span>`).join('') || '<span class="muted">—</span>'}</div>
        <div class="small muted" style="margin:12px 0 6px">Kategori:</div>
        <div class="pill-list">${categories.map((category) => `<span class="pill">${esc(category)}</span>`).join('') || '<span class="muted">—</span>'}</div>
        <div class="notice section-gap-sm">${icon('gauge', 16)} Chrome dikesan: ${esc(meta.chrome || 'tidak ditemui')}. Lighthouse hanya berjalan jika Chrome/Edge tersedia.</div>
      </article>

      <article class="card">
        ${cardHead('Meta audit', 'Maklumat teknikal dashboard')}
        <dl class="kv">
          <dt>Dijana</dt><dd>${esc(fmtDateTime(s.generated_at))}</dd>
          <dt>Tempoh</dt><dd>${s.duration_ms ? `${(s.duration_ms / 1000).toFixed(1)} saat` : '—'}</dd>
          <dt>Versi</dt><dd class="mono">${esc(meta.version || '—')}</dd>
          <dt>Tool</dt><dd class="mono">${esc(meta.tool || '—')}</dd>
          <dt>Root website</dt><dd class="mono">${esc(meta.site_root || '—')}</dd>
          <dt>Snapshot statik</dt><dd>${esc(meta.static_generated_at ? fmtDateTime(meta.static_generated_at) : '—')}</dd>
          <dt>Rekod sejarah</dt><dd>${fmtNumber(state.history.length)}</dd>
          <dt>Fail DB</dt><dd>${fmtNumber(dbFiles.length)}</dd>
        </dl>
      </article>
    </section>

    <article class="card section-gap">
      ${cardHead('Sumber data', 'Fail yang disalin ke data/db/')}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fail</th><th>Label</th><th>Sumber</th><th class="num">Rekod</th><th class="num">Saiz</th></tr></thead>
          <tbody>${dbFiles.map((file) => `<tr>
            <td class="mono">${esc(file.name)}</td>
            <td>${esc(file.label || '—')}</td>
            <td class="mono small">${esc(file.source)}</td>
            <td class="num">${fmtNumber(file.records)}</td>
            <td class="num nowrap">${esc(fmtBytes(file.bytes))}</td>
          </tr>`).join('') || `<tr><td colspan="5" class="table-empty">Tiada fail.</td></tr>`}</tbody>
        </table>
      </div>
    </article>

    <section class="grid grid--2 section-gap">
      <article class="card">
        ${cardHead('Arahan tempatan', 'Jalankan dashboard pada komputer')}
        <pre class="code-block"># Pasang dependency (sekali)
npm install

# Audit pantas
npm run audit

# Audit penuh dengan Lighthouse
npm run audit:full

# Buka dashboard
npm run serve
# http://127.0.0.1:8082/</pre>
        <div class="notice section-gap-sm">${icon('help', 16)} Di Windows, klik dua kali <code>start-monitor.bat</code> atau jalankan <code>start-monitor.bat --full</code>.</div>
      </article>

      <article class="card">
        ${cardHead('Aliran kerja GitHub Actions', 'Automasi audit dan deploy')}
        <pre class="code-block">checkout website + monitor
        ↓
npm ci
        ↓
node tools/audit.mjs --lighthouse
        ↓
commit data/*.json  [skip ci]
        ↓
upload artifact Pages
        ↓
deploy ke GitHub Pages</pre>
        <div class="notice section-gap-sm">${icon('uploadCloud', 16)} Workflow berjalan pada jadual dan setiap push. Data sejarah disimpan dalam repo monitor.</div>
      </article>
    </section>

    <article class="card section-gap">
      ${cardHead('Pautan', 'Akses pantas')}
      <div class="pill-list">
        <a class="btn btn--ghost btn--sm" href="${esc(config?.pautan?.github || '#')}" target="_blank" rel="noopener">${icon('git', 13)} Repo monitor</a>
        <a class="btn btn--ghost btn--sm" href="${esc(config?.pautan?.actions || '#')}" target="_blank" rel="noopener">${icon('activity', 13)} Actions</a>
        <a class="btn btn--ghost btn--sm" href="${esc(config?.pautan?.pages || '#')}" target="_blank" rel="noopener">${icon('globe', 13)} Dashboard live</a>
        <a class="btn btn--ghost btn--sm" href="${esc(config?.pautan?.website || '#')}" target="_blank" rel="noopener">${icon('external', 13)} Website PERKIM</a>
        <a class="btn btn--ghost btn--sm" href="${esc(s.site?.r2 || '#')}" target="_blank" rel="noopener">${icon('server', 13)} Bucket R2</a>
      </div>
    </article>
  `;

  root.querySelector('#settings-theme')?.addEventListener('click', () => {
    document.getElementById('theme-btn')?.click();
  });

  root.querySelector('#settings-export')?.addEventListener('click', () => {
    downloadJSON(`perkim-monitor-export-${new Date().toISOString().slice(0, 10)}.json`, {
      exported_at: new Date().toISOString(),
      status: s,
      history: state.history,
      uptime: state.uptime,
      config: state.config,
      checklist: state.checklist,
      db_index: state.dbIndex,
    });
    showToast('Semua data dashboard dieksport.', 'success');
  });
}
