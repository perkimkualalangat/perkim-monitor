import { state, loadDatabaseFile, websiteUrl } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, fmtBytes, fmtDateTime, fmtNumber,
  showToast, downloadJSON, copyText, emptyState,
} from '../core/ui.js';

function fileMeta(file) {
  return `${fmtNumber(file.records)} ${esc(file.record_label || 'rekod')} · ${esc(fmtBytes(file.bytes))} · ${esc(file.type || '')}`;
}

export async function render(root) {
  const s = state.status;
  const index = state.dbIndex;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }
  if (!index || !Array.isArray(index.files) || !index.files.length) {
    root.innerHTML = `<div class="card">${emptyState('database', 'Tiada snapshot pangkalan data', 'Jalankan audit untuk menjana data/db/index.json.')}</div>`;
    return;
  }

  const files = index.files;
  const totalBytes = files.reduce((sum, file) => sum + (file.bytes || 0), 0);
  const totalRecords = files.reduce((sum, file) => sum + (file.records || 0), 0);

  root.innerHTML = `
    ${pageHead(
      'Pangkalan data',
      `${files.length} snapshot JSON disalin daripada website pada ${fmtDateTime(index.generated_at)}. Data ini baca-sahaja.`,
      `<a class="btn btn--ghost btn--sm" href="${esc(websiteUrl('data/'))}" target="_blank" rel="noopener">${icon('external', 14)} Folder data website</a>`,
    )}

    <section class="grid grid--kpi">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Fail JSON</span><span class="kpi__icon">${icon('database', 17)}</span></div><div class="kpi__value">${files.length}</div><div class="kpi__meta">Snapshot audit</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Jumlah rekod</span><span class="kpi__icon">${icon('layers', 17)}</span></div><div class="kpi__value">${fmtNumber(totalRecords)}</div><div class="kpi__meta">Merentas semua fail</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Saiz data</span><span class="kpi__icon">${icon('server', 17)}</span></div><div class="kpi__value">${esc(fmtBytes(totalBytes))}</div><div class="kpi__meta">Tidak termasuk aset</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Dijana</span><span class="kpi__icon">${icon('clock', 17)}</span></div><div class="kpi__value kpi__value--small">${esc(fmtDateTime(index.generated_at))}</div><div class="kpi__meta">Oleh tools/audit.mjs</div></article>
    </section>

    <section class="db-layout section-gap">
      <aside class="card db-sidebar">
        ${cardHead('Fail', 'Pilih untuk lihat JSON')}
        <div class="db-files" role="list">
          ${files.map((file, i) => `<button class="db-file${i === 0 ? ' is-active' : ''}" type="button" data-file="${esc(file.name)}" role="listitem">
            <span><span class="db-file__name">${esc(file.name)}</span><small>${esc(file.label || '')}</small></span>
            <small>${esc(file.records)}</small>
          </button>`).join('')}
        </div>
      </aside>

      <article class="card db-viewer">
        <div class="card__head">
          <div><h3 id="db-title">${esc(files[0].name)}</h3><p id="db-subtitle">${esc(files[0].label || '')}</p></div>
          <div class="db-actions">
            <button class="btn btn--ghost btn--sm" type="button" id="db-copy">${icon('code', 13)} Salin</button>
            <button class="btn btn--ghost btn--sm" type="button" id="db-download">${icon('download', 13)} Muat turun</button>
            <a class="btn btn--ghost btn--sm" id="db-source" href="${esc(websiteUrl(files[0].source))}" target="_blank" rel="noopener">${icon('external', 13)} Sumber</a>
          </div>
        </div>
        <div class="db-meta" id="db-meta">
          <span>${fileMeta(files[0])}</span>
          <span class="mono">${esc(files[0].source)}</span>
        </div>
        <div id="db-content"><div class="loading loading--inline"><div class="spinner" aria-hidden="true"></div><p>Memuatkan JSON…</p></div></div>
      </article>
    </section>
  `;

  const buttons = [...root.querySelectorAll('.db-file')];
  const title = root.querySelector('#db-title');
  const subtitle = root.querySelector('#db-subtitle');
  const meta = root.querySelector('#db-meta');
  const content = root.querySelector('#db-content');
  const source = root.querySelector('#db-source');
  const copyButton = root.querySelector('#db-copy');
  const downloadButton = root.querySelector('#db-download');
  let active = files[0];
  let activeData = null;

  async function open(file) {
    active = file;
    activeData = null;
    buttons.forEach((button) => button.classList.toggle('is-active', button.dataset.file === file.name));
    title.textContent = file.name;
    subtitle.textContent = file.label || '';
    meta.innerHTML = `<span>${fileMeta(file)}</span><span class="mono">${esc(file.source)}</span>`;
    source.href = websiteUrl(file.source);
    content.innerHTML = `<div class="loading loading--inline"><div class="spinner" aria-hidden="true"></div><p>Memuatkan JSON…</p></div>`;
    try {
      const data = await loadDatabaseFile(file.name);
      activeData = data;
      const pre = document.createElement('pre');
      pre.className = 'raw-json';
      pre.textContent = JSON.stringify(data, null, 2);
      content.replaceChildren(pre);
    } catch (error) {
      content.innerHTML = `<div class="notice notice--danger">${icon('x', 16)} Gagal memuatkan ${esc(file.name)}: ${esc(error.message)}</div>`;
    }
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const file = files.find((item) => item.name === button.dataset.file);
      if (file) open(file);
    });
  });

  copyButton.addEventListener('click', async () => {
    if (!activeData) return;
    const ok = await copyText(JSON.stringify(activeData, null, 2));
    showToast(ok ? `${active.name} disalin ke papan klip.` : 'Papan klip tidak tersedia.', ok ? 'success' : 'warn');
  });

  downloadButton.addEventListener('click', () => {
    if (!activeData) return;
    downloadJSON(active.name, activeData);
    showToast(`${active.name} dimuat turun.`, 'success');
  });

  await open(files[0]);
}
