import { state } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, statusBadge, statusLabel,
  fmtNumber, debounce, emptyState,
} from '../core/ui.js';

function itemText(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item ?? '');
  const priority = ['mesej', 'message', 'error', 'fail', 'page', 'label', 'tajuk', 'pautan', 'url', 'program', 'buku', 'status', 'baris'];
  const parts = [];
  for (const key of priority) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
      parts.push(String(item[key]));
    }
  }
  if (!parts.length) {
    return Object.entries(item)
      .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
      .map(([key, value]) => `${key}: ${value}`)
      .join(' · ');
  }
  return parts.join(' · ');
}

function checkMarkup(check) {
  const items = Array.isArray(check.items) ? check.items : [];
  return `<article class="check-item" data-status="${esc(check.status)}" data-category="${esc(check.category || '')}" data-search="${esc(`${check.label} ${check.id} ${check.detail} ${check.category}`.toLowerCase())}">
    <div class="check-item__head">
      ${statusBadge(check.status)}
      <div class="check-item__title">${esc(check.label)}</div>
      <span class="pill mono">${esc(check.id)}</span>
      <span class="pill">${esc(check.category || '—')}</span>
    </div>
    <div class="check-item__detail">${esc(check.detail || '—')}</div>
    ${items.length ? `<details class="check-item__details">
      <summary>${items.length} butiran</summary>
      <ul class="detail-list">${items.map((item) => `<li>${esc(itemText(item))}</li>`).join('')}</ul>
    </details>` : ''}
  </article>`;
}

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const checks = s.checks || [];
  const categories = [...new Set(checks.map((check) => check.category).filter(Boolean))].sort();
  const counts = {
    pass: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
    unknown: checks.filter((check) => check.status === 'unknown').length,
  };

  root.innerHTML = `
    ${pageHead(
      'Status semakan',
      `${checks.length} semakan daripada audit ${s.site?.name || 'PERKIM'}. Klik butiran untuk melihat item yang terlibat.`,
      `<a class="btn btn--ghost btn--sm" href="#/pangkalan-data">${icon('database', 14)} Data mentah</a>`,
    )}

    <section class="grid grid--kpi">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Lulus</span><span class="kpi__icon">${icon('check', 17)}</span></div><div class="kpi__value">${counts.pass}</div><div class="kpi__meta">Daripada ${checks.length} semakan</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Amaran</span><span class="kpi__icon kpi__icon--warn">${icon('alert', 17)}</span></div><div class="kpi__value">${counts.warn}</div><div class="kpi__meta">Perlu semakan tetapi tidak kritikal</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Gagal</span><span class="kpi__icon kpi__icon--fail">${icon('x', 17)}</span></div><div class="kpi__value">${counts.fail}</div><div class="kpi__meta">Perlu tindakan segera</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Tidak diketahui</span><span class="kpi__icon kpi__icon--muted">${icon('help', 17)}</span></div><div class="kpi__value">${counts.unknown}</div><div class="kpi__meta">Data tidak mencukupi</div></article>
    </section>

    <article class="card section-gap">
      ${cardHead('Senarai semakan', 'Tapis mengikut status, kategori atau carian')}
      <div class="filter-bar">
        <input class="input" type="search" id="check-search" placeholder="Cari semakan, ID atau butiran…" aria-label="Cari semakan">
        <select class="select" id="check-status" aria-label="Tapis status">
          <option value="">Semua status</option>
          <option value="fail">Gagal</option>
          <option value="warn">Amaran</option>
          <option value="pass">Lulus</option>
          <option value="unknown">Tidak diketahui</option>
        </select>
        <select class="select" id="check-category" aria-label="Tapis kategori">
          <option value="">Semua kategori</option>
          ${categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('')}
        </select>
        <span class="filter-count" id="check-count">${checks.length} semakan</span>
      </div>
      <div class="check-list" id="check-list">
        ${checks.map(checkMarkup).join('')}
      </div>
      <div class="empty" id="check-empty" hidden>
        ${icon('search', 38)}
        <h3>Tiada semakan sepadan</h3>
        <p>Cuba tukar penapis atau kata carian.</p>
      </div>
    </article>
  `;

  const search = root.querySelector('#check-search');
  const status = root.querySelector('#check-status');
  const category = root.querySelector('#check-category');
  const list = root.querySelector('#check-list');
  const count = root.querySelector('#check-count');
  const empty = root.querySelector('#check-empty');
  const all = [...list.querySelectorAll('.check-item')];

  const apply = () => {
    const query = search.value.trim().toLowerCase();
    const statusValue = status.value;
    const categoryValue = category.value;
    let visible = 0;
    for (const item of all) {
      const matches = (!query || item.dataset.search.includes(query))
        && (!statusValue || item.dataset.status === statusValue)
        && (!categoryValue || item.dataset.category === categoryValue);
      item.hidden = !matches;
      if (matches) visible += 1;
    }
    count.textContent = `${visible} daripada ${all.length} semakan`;
    empty.hidden = visible > 0;
  };

  search.addEventListener('input', debounce(apply, 120));
  status.addEventListener('change', apply);
  category.addEventListener('change', apply);
}
