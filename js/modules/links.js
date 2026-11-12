import { state } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, statusBadge, fmtMs,
  fmtNumber, debounce, emptyState, truncate,
} from '../core/ui.js';

function linkRow(link) {
  const tone = link.level === 'pass' ? 'pass' : link.level === 'warn' ? 'warn' : 'fail';
  return `<tr data-kind="${esc(link.type)}" data-tone="${tone}" data-search="${esc(`${link.url} ${link.text || ''} ${(link.sources || []).join(' ')}`.toLowerCase())}">
    <td>
      <div class="truncate" title="${esc(link.url)}"><a href="${esc(link.url)}" target="_blank" rel="noopener" class="mono">${esc(truncate(link.url, 78))}</a></div>
      ${link.text ? `<div class="table-sub">${esc(link.text)}</div>` : ''}
    </td>
    <td><span class="pill">${link.type === 'internal' ? 'Dalaman' : 'Luaran'}</span></td>
    <td>${statusBadge(tone, link.status ? `HTTP ${link.status}` : 'Tiada respons')}</td>
    <td class="num nowrap">${esc(fmtMs(link.ms))}</td>
    <td><div class="truncate small" title="${esc((link.sources || []).join(', '))}">${esc(truncate((link.sources || []).join(', '), 44) || '—')}</div></td>
    <td>${link.error ? `<span class="small danger-text">${esc(truncate(link.error, 48))}</span>` : '<span class="muted small">—</span>'}</td>
  </tr>`;
}

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const links = s.links || [];
  const internal = links.filter((link) => link.type === 'internal');
  const external = links.filter((link) => link.type === 'external');
  const fails = links.filter((link) => link.level === 'fail');
  const warns = links.filter((link) => link.level === 'warn');
  const pass = links.filter((link) => link.level === 'pass');

  root.innerHTML = `
    ${pageHead(
      'Pautan & aset',
      `${links.length} pautan unik disemak daripada ${s.pages?.length || 0} halaman. Pautan luaran dihadkan untuk mengelakkan beban berlebihan.`,
      `<a class="btn btn--ghost btn--sm" href="#/semakan">${icon('checkSquare', 14)} Semakan penuh</a>`,
    )}

    <section class="grid grid--kpi">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Jumlah pautan</span><span class="kpi__icon">${icon('link', 17)}</span></div><div class="kpi__value">${fmtNumber(links.length)}</div><div class="kpi__meta">${internal.length} dalaman · ${external.length} luaran</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Lulus</span><span class="kpi__icon">${icon('check', 17)}</span></div><div class="kpi__value">${pass.length}</div><div class="kpi__meta">Respons 2xx/3xx</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Amaran</span><span class="kpi__icon kpi__icon--warn">${icon('alert', 17)}</span></div><div class="kpi__value">${warns.length}</div><div class="kpi__meta">401, 403, 405, 429 atau domain sosial</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Gagal</span><span class="kpi__icon kpi__icon--fail">${icon('x', 17)}</span></div><div class="kpi__value">${fails.length}</div><div class="kpi__meta">Perlu dibaiki</div></article>
    </section>

    ${fails.length ? `<div class="notice notice--danger section-gap">${icon('x', 16)} <div><strong>${fails.length} pautan gagal.</strong> Semak URL dan pastikan fail wujud sebelum menerbitkan perubahan.</div></div>` : ''}

    <article class="card section-gap">
      ${cardHead('Semua pautan', 'Tapis mengikut jenis, status atau carian')}
      <div class="filter-bar">
        <input class="input" type="search" id="link-search" placeholder="Cari URL, teks atau halaman sumber…" aria-label="Cari pautan">
        <select class="select" id="link-kind" aria-label="Tapis jenis pautan">
          <option value="">Semua jenis</option>
          <option value="internal">Dalaman</option>
          <option value="external">Luaran</option>
        </select>
        <select class="select" id="link-tone" aria-label="Tapis status pautan">
          <option value="">Semua status</option>
          <option value="fail">Gagal</option>
          <option value="warn">Amaran</option>
          <option value="pass">Lulus</option>
        </select>
        <span class="filter-count" id="link-count">${links.length} pautan</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>URL</th><th>Jenis</th><th>Status</th><th class="num">Masa</th><th>Sumber</th><th>Ralat</th></tr></thead>
          <tbody id="link-rows">${links.map(linkRow).join('')}</tbody>
        </table>
      </div>
      <div class="empty" id="link-empty" hidden>${icon('search', 38)}<h3>Tiada pautan sepadan</h3><p>Cuba tukar penapis.</p></div>
    </article>

    <article class="card section-gap">
      ${cardHead('Nota semakan', 'Cara audit mengendalikan pautan')}
      <ul class="detail-list">
        <li>Pautan dalaman disemak dengan HEAD, kemudian GET jika pelayan menolak HEAD.</li>
        <li>Pautan sosial dan domain yang menyekat bot dilaporkan sebagai amaran, bukan kegagalan.</li>
        <li>Pautan <code>mailto:</code>, <code>tel:</code>, <code>javascript:</code> dan <code>#</code> tidak disemak.</li>
        <li>Had lalai: ${esc(state.config?.audit?.max_internal_links || 80)} pautan dalaman dan ${esc(state.config?.audit?.max_external_links || 60)} pautan luaran setiap audit.</li>
      </ul>
    </article>
  `;

  const search = root.querySelector('#link-search');
  const kind = root.querySelector('#link-kind');
  const tone = root.querySelector('#link-tone');
  const rows = [...root.querySelectorAll('#link-rows tr')];
  const count = root.querySelector('#link-count');
  const empty = root.querySelector('#link-empty');

  const apply = () => {
    const query = search.value.trim().toLowerCase();
    const kindValue = kind.value;
    const toneValue = tone.value;
    let visible = 0;
    for (const row of rows) {
      const matches = (!query || row.dataset.search.includes(query))
        && (!kindValue || row.dataset.kind === kindValue)
        && (!toneValue || row.dataset.tone === toneValue);
      row.hidden = !matches;
      if (matches) visible += 1;
    }
    count.textContent = `${visible} daripada ${rows.length} pautan`;
    empty.hidden = visible > 0;
  };

  search.addEventListener('input', debounce(apply, 120));
  kind.addEventListener('change', apply);
  tone.addEventListener('change', apply);
}
