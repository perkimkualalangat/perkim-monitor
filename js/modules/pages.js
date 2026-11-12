import { state } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, statusBadge, fmtMs, fmtBytes,
  fmtNumber, debounce, scoreStatus,
} from '../core/ui.js';

function pageTone(page) {
  if (!page.ok) return 'fail';
  if ((page.issues || []).some((item) => item.severity === 'fail')) return 'fail';
  if ((page.issues || []).some((item) => item.severity === 'warn')) return 'warn';
  return 'pass';
}

function issueList(page) {
  const items = (page.issues || []).slice(0, 8);
  if (!items.length) return '<span class="muted small">Tiada isu</span>';
  return `<details><summary>${items.length} isu</summary><ul class="detail-list">${items.map((item) => `<li>${esc(item.message || item.mesej || String(item))}</li>`).join('')}</ul></details>`;
}

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const pages = s.pages || [];
  const ok = pages.filter((page) => page.ok).length;
  const avg = pages.length ? Math.round(pages.reduce((sum, page) => sum + (page.ms || 0), 0) / pages.length) : 0;
  const totalIssues = pages.reduce((sum, page) => sum + (page.issues || []).length, 0);
  const totalImages = pages.reduce((sum, page) => sum + (page.images || 0), 0);
  const missingAlt = pages.reduce((sum, page) => sum + (page.missing_alt || 0), 0);

  root.innerHTML = `
    ${pageHead(
      'Halaman awam',
      `${pages.length} halaman dipantau pada ${esc(s.site?.url || '')}.`,
      `<a class="btn btn--ghost btn--sm" href="${esc(s.site?.url || '#')}" target="_blank" rel="noopener">${icon('external', 14)} Buka laman</a>`,
    )}

    <section class="grid grid--kpi">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Halaman live</span><span class="kpi__icon">${icon('pages', 17)}</span></div><div class="kpi__value">${ok}/${pages.length}</div><div class="kpi__meta">Respons HTTP 200</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Purata respons</span><span class="kpi__icon">${icon('clock', 17)}</span></div><div class="kpi__value">${avg} <span class="kpi__unit">ms</span></div><div class="kpi__meta">Had amaran ${esc(state.config?.ambang?.masa_ms || 2500)} ms</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Jumlah isu</span><span class="kpi__icon kpi__icon--warn">${icon('alert', 17)}</span></div><div class="kpi__value">${totalIssues}</div><div class="kpi__meta">Isu statik dan live</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Imej</span><span class="kpi__icon">${icon('eye', 17)}</span></div><div class="kpi__value">${fmtNumber(totalImages)}</div><div class="kpi__meta">${missingAlt ? `${missingAlt} tiada alt` : 'Semua imej ada alt'}</div></article>
    </section>

    <article class="card section-gap">
      ${cardHead('Senarai halaman', 'Status, masa respons, saiz dan isu setiap halaman')}
      <div class="filter-bar">
        <input class="input" type="search" id="page-search" placeholder="Cari halaman atau laluan…" aria-label="Cari halaman">
        <select class="select" id="page-filter" aria-label="Tapis status halaman">
          <option value="">Semua halaman</option>
          <option value="pass">Sihat</option>
          <option value="warn">Amaran</option>
          <option value="fail">Gagal</option>
        </select>
        <span class="filter-count" id="page-count">${pages.length} halaman</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Halaman</th><th>Status</th><th class="num">Masa</th><th class="num">Saiz HTML</th>
            <th class="num">H1</th><th class="num">Imej</th><th class="num">Pautan</th><th>Isu</th>
          </tr></thead>
          <tbody id="page-rows">
            ${pages.map((page) => {
              const tone = pageTone(page);
              const label = page.label || page.path || 'Halaman Utama';
              return `<tr data-tone="${tone}" data-search="${esc(`${label} ${page.path} ${page.title}`.toLowerCase())}">
                <td>
                  <div class="table-title">${esc(label)}</div>
                  <div class="table-sub"><a class="mono" href="${esc(page.url)}" target="_blank" rel="noopener">${esc(page.path || '/')}</a></div>
                </td>
                <td>${statusBadge(tone, tone === 'pass' ? 'Sihat' : tone === 'warn' ? 'Amaran' : 'Gagal')}</td>
                <td class="num nowrap">${esc(fmtMs(page.ms))}</td>
                <td class="num nowrap">${esc(fmtBytes(page.bytes))}</td>
                <td class="num">${esc(page.h1 ?? '—')}</td>
                <td class="num">${esc(page.images ?? 0)}</td>
                <td class="num">${esc((page.internal_links || 0) + (page.external_links || 0))}</td>
                <td>${issueList(page)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="empty" id="page-empty" hidden>${icon('search', 38)}<h3>Tiada halaman sepadan</h3><p>Cuba kata carian lain.</p></div>
    </article>

    <article class="card section-gap">
      ${cardHead('Butiran teknikal', 'Saiz fail statik dan metadata utama')}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Halaman</th><th>Tajuk</th><th>Bahasa</th><th>Robots</th><th class="num">Saiz statik</th></tr></thead>
          <tbody>
            ${pages.map((page) => `<tr>
              <td class="mono">${esc(page.path || 'index.html')}</td>
              <td><div class="truncate" title="${esc(page.title)}">${esc(page.title || '—')}</div></td>
              <td>${esc(page.lang || '—')}</td>
              <td><span class="pill">${esc(page.robots || '—')}</span></td>
              <td class="num nowrap">${esc(page.static?.bytes ? fmtBytes(page.static.bytes) : '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </article>
  `;

  const search = root.querySelector('#page-search');
  const filter = root.querySelector('#page-filter');
  const rows = [...root.querySelectorAll('#page-rows tr')];
  const count = root.querySelector('#page-count');
  const empty = root.querySelector('#page-empty');

  const apply = () => {
    const query = search.value.trim().toLowerCase();
    const tone = filter.value;
    let visible = 0;
    for (const row of rows) {
      const matches = (!query || row.dataset.search.includes(query)) && (!tone || row.dataset.tone === tone);
      row.hidden = !matches;
      if (matches) visible += 1;
    }
    count.textContent = `${visible} daripada ${rows.length} halaman`;
    empty.hidden = visible > 0;
  };

  search.addEventListener('input', debounce(apply, 120));
  filter.addEventListener('change', apply);
}
