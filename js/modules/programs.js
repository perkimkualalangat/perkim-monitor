import { state, websiteUrl } from '../core/data.js';
import {
  icon, esc, pageHead, fmtDate, statusBadge, safeHref, emptyState,
} from '../core/ui.js';

function programCard(item) {
  const images = Array.isArray(item.images) ? item.images : [];
  const cover = images[0];
  const coverUrl = cover?.src ? websiteUrl(cover.src) : '';
  const tone = item.issues?.length ? 'warn' : 'pass';
  return `<article class="program-card">
    <div class="program-card__media">
      ${coverUrl
        ? `<img src="${esc(coverUrl)}" alt="${esc(cover.alt || item.tajuk)}" loading="lazy">`
        : `<div class="program-card__placeholder">${icon('calendar', 40)}</div>`}
      <span class="program-card__badge">${item.sorotan ? `Sorotan ${item.sorotan}` : 'Program'}</span>
    </div>
    <div class="program-card__body">
      <div class="badge-row">
        ${statusBadge(item.status === 'terbit' ? 'pass' : 'warn', item.status === 'draf' ? 'Draf' : (item.status || 'Draf'))}
        <span class="badge badge--unknown">${esc(item.kategori || '—')}</span>
      </div>
      <h3>${esc(item.tajuk)}</h3>
      <div class="program-card__meta">
        <span>${icon('calendar', 13)} ${esc(fmtDate(item.tarikh))}</span>
        <span>${icon('eye', 13)} ${images.length} gambar</span>
        <span>${icon('layers', 13)} ${esc(item.slug || item.id)}</span>
      </div>
      ${item.issues?.length
        ? `<div class="notice notice--warn">${icon('alert', 15)} ${esc(item.issues.map((issue) => issue.mesej || issue.message).join(' · '))}</div>`
        : `<div class="notice notice--success">${icon('check', 15)} Alt text dan fail gambar lengkap.</div>`}
      <div class="gallery">
        ${images.slice(0, 4).map((image) => `<img src="${esc(websiteUrl(image.src))}" alt="${esc(image.alt || '')}" loading="lazy" title="${esc(image.kapsyen || image.alt || '')}">`).join('')}
      </div>
      <div class="program-card__actions">
        <a class="btn btn--ghost btn--sm" href="${esc(websiteUrl('pages/aktiviti.html'))}" target="_blank" rel="noopener">${icon('external', 13)} Lihat program</a>
        <span class="pill">${esc(item.status === 'draf' ? 'Belum disahkan' : 'Disahkan')}</span>
      </div>
    </div>
  </article>`;
}

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const programs = s.programs?.items || [];
  const sorotan = programs.filter((item) => item.sorotan).length;
  const draf = programs.filter((item) => item.status === 'draf').length;
  const gambar = programs.reduce((sum, item) => sum + (item.gambar || 0), 0);
  const altMissing = programs.reduce((sum, item) => sum + (item.alt_missing || 0), 0);

  root.innerHTML = `
    ${pageHead(
      'Program cawangan',
      `${programs.length} program dalam data aktiviti. Semua kandungan program disemak sebelum diterbitkan.`,
      `<a class="btn btn--ghost btn--sm" href="${esc(websiteUrl('pages/aktiviti.html'))}" target="_blank" rel="noopener">${icon('external', 14)} Halaman aktiviti</a>`,
    )}

    <section class="grid grid--kpi">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Jumlah program</span><span class="kpi__icon">${icon('calendar', 17)}</span></div><div class="kpi__value">${programs.length}</div><div class="kpi__meta">${sorotan} disorot</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Status draf</span><span class="kpi__icon kpi__icon--warn">${icon('alert', 17)}</span></div><div class="kpi__value">${draf}</div><div class="kpi__meta">Menunggu pengesahan</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Gambar</span><span class="kpi__icon">${icon('eye', 17)}</span></div><div class="kpi__value">${gambar}</div><div class="kpi__meta">Dalam galeri program</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Alt text</span><span class="kpi__icon">${icon('accessibility', 17)}</span></div><div class="kpi__value">${altMissing ? altMissing : 'Lengkap'}</div><div class="kpi__meta">${altMissing ? 'Gambar tiada alt' : 'Semua gambar ada alt'}</div></article>
    </section>

    ${programs.length
      ? `<section class="program-grid section-gap">${programs.map(programCard).join('')}</section>`
      : `<article class="card section-gap">${emptyState('calendar', 'Tiada program', 'Tiada rekod program dalam data/aktiviti.json.')}</article>`}

    <article class="card section-gap">
      <div class="notice">${icon('help', 16)} Nombor sorotan mesti unik. Audit akan gagal jika dua program menggunakan nombor sorotan yang sama. Semak selepas setiap kemas kini program.</div>
    </article>
  `;
}
