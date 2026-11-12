import { state } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, statusBadge, fmtBytes, fmtMs,
  fmtNumber, debounce, emptyState,
} from '../core/ui.js';

function bookRow(book) {
  const pdfTone = book.pdf_level === 'pass' ? 'pass' : book.pdf_level === 'warn' ? 'warn' : 'fail';
  const coverTone = book.cover_level === 'pass' ? 'pass' : book.cover_level === 'warn' ? 'warn' : 'fail';
  return `<tr data-search="${esc(`${book.tajuk} ${book.id} ${book.kumpulan}`.toLowerCase())}" data-tone="${pdfTone === 'pass' && coverTone === 'pass' ? 'pass' : 'warn'}">
    <td>
      <div class="book-cell">
        ${book.cover ? `<img class="book-cover" src="${esc(book.cover)}" alt="Cover ${esc(book.tajuk)}" loading="lazy">` : `<div class="book-cover book-cover--empty">${icon('book', 18)}</div>`}
        <div>
          <div class="table-title">${esc(book.tajuk)}</div>
          <div class="table-sub">${esc(book.keterangan || book.kumpulan || '')}</div>
          <div class="table-sub mono">${esc(book.id)}</div>
        </div>
      </div>
    </td>
    <td><span class="pill">${esc(book.kumpulan || '—')}</span></td>
    <td>${statusBadge(pdfTone, `HTTP ${book.pdf_status || '—'}`)}</td>
    <td class="num nowrap">${esc(fmtBytes(book.pdf_bytes))}</td>
    <td>${statusBadge(coverTone, `HTTP ${book.cover_status || '—'}`)}</td>
    <td class="num nowrap">${esc(fmtBytes(book.cover_bytes))}</td>
    <td class="num nowrap">${esc(fmtMs((book.pdf_ms || 0) + (book.cover_ms || 0)))}</td>
    <td class="nowrap">
      <a class="btn btn--ghost btn--sm" href="${esc(book.pdf || '#')}" target="_blank" rel="noopener">${icon('external', 12)} PDF</a>
    </td>
  </tr>`;
}

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const books = s.books || [];
  const ok = books.filter((book) => book.pdf_ok && book.cover_ok).length;
  const pdfOk = books.filter((book) => book.pdf_ok).length;
  const coverOk = books.filter((book) => book.cover_ok).length;
  const totalPdf = books.reduce((sum, book) => sum + (book.pdf_bytes || 0), 0);
  const groups = [...new Set(books.map((book) => book.kumpulan).filter(Boolean))];

  root.innerHTML = `
    ${pageHead(
      'Bahan bacaan',
      `${books.length} buku dalam ${groups.length} kumpulan. PDF dan cover disemak terus daripada bucket R2.`,
      `<a class="btn btn--ghost btn--sm" href="${esc(s.site?.r2 || '#')}" target="_blank" rel="noopener">${icon('external', 14)} Bucket R2</a>`,
    )}

    <section class="grid grid--kpi">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Buku sihat</span><span class="kpi__icon">${icon('book', 17)}</span></div><div class="kpi__value">${ok}/${books.length}</div><div class="kpi__meta">PDF dan cover OK</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">PDF</span><span class="kpi__icon">${icon('file-text', 17)}</span></div><div class="kpi__value">${pdfOk}/${books.length}</div><div class="kpi__meta">Boleh dimuat turun</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Cover</span><span class="kpi__icon">${icon('eye', 17)}</span></div><div class="kpi__value">${coverOk}/${books.length}</div><div class="kpi__meta">Imej R2</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Jumlah PDF</span><span class="kpi__icon">${icon('database', 17)}</span></div><div class="kpi__value">${esc(fmtBytes(totalPdf))}</div><div class="kpi__meta">Saiz keseluruhan</div></article>
    </section>

    <article class="card section-gap">
      ${cardHead('Senarai buku', 'Klik PDF untuk membuka dokumen dalam tab baharu')}
      <div class="filter-bar">
        <input class="input" type="search" id="book-search" placeholder="Cari tajuk atau ID buku…" aria-label="Cari buku">
        <select class="select" id="book-group" aria-label="Tapis kumpulan">
          <option value="">Semua kumpulan</option>
          ${groups.map((group) => `<option value="${esc(group)}">${esc(group)}</option>`).join('')}
        </select>
        <select class="select" id="book-filter" aria-label="Tapis status">
          <option value="">Semua status</option>
          <option value="pass">Sihat</option>
          <option value="warn">Ada masalah</option>
        </select>
        <span class="filter-count" id="book-count">${books.length} buku</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Buku</th><th>Kumpulan</th><th>PDF</th><th class="num">Saiz</th>
            <th>Cover</th><th class="num">Saiz</th><th class="num">Masa</th><th></th>
          </tr></thead>
          <tbody id="book-rows">${books.map(bookRow).join('')}</tbody>
        </table>
      </div>
      <div class="empty" id="book-empty" hidden>${icon('search', 38)}<h3>Tiada buku sepadan</h3><p>Cuba kata carian atau penapis lain.</p></div>
    </article>

    <article class="card section-gap">
      ${cardHead('Nota R2', 'Penyimpanan PDF dan cover')}
      <div class="notice">${icon('help', 16)} Semua PDF berada di root bucket R2 dan cover di folder <code>covers/</code>. Jika pautan R2 berubah, kemas kini <code>data/books.json</code> di website dan jalankan semula audit.</div>
    </article>
  `;

  const search = root.querySelector('#book-search');
  const group = root.querySelector('#book-group');
  const filter = root.querySelector('#book-filter');
  const rows = [...root.querySelectorAll('#book-rows tr')];
  const count = root.querySelector('#book-count');
  const empty = root.querySelector('#book-empty');

  const apply = () => {
    const query = search.value.trim().toLowerCase();
    const groupValue = group.value;
    const tone = filter.value;
    let visible = 0;
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      const rowGroup = cells[1]?.textContent.trim() || '';
      const matches = (!query || row.dataset.search.includes(query))
        && (!groupValue || rowGroup === groupValue)
        && (!tone || row.dataset.tone === tone);
      row.hidden = !matches;
      if (matches) visible += 1;
    }
    count.textContent = `${visible} daripada ${rows.length} buku`;
    empty.hidden = visible > 0;
  };

  search.addEventListener('input', debounce(apply, 120));
  group.addEventListener('change', apply);
  filter.addEventListener('change', apply);
}
