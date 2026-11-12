import { state } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, statusBadge, scoreBadge, scoreStatus,
  fmtNumber, truncate,
} from '../core/ui.js';
import { donut } from '../core/charts.js';

function lengthBadge(value, min, max, label) {
  const length = String(value || '').length;
  if (!length) return statusBadge('fail', `${label} tiada`);
  const tone = length >= min && length <= max ? 'pass' : 'warn';
  return statusBadge(tone, `${length} aksara`);
}

function seoRow(page) {
  const issues = page.issues || [];
  const fail = issues.some((item) => item.severity === 'fail');
  const warn = issues.some((item) => item.severity === 'warn');
  const tone = fail ? 'fail' : warn ? 'warn' : 'pass';
  return `<tr data-tone="${tone}">
    <td>
      <div class="table-title">${esc(page.label || page.path || 'Halaman Utama')}</div>
      <div class="table-sub mono">${esc(page.path || '/')}</div>
    </td>
    <td><div class="truncate" title="${esc(page.title)}">${esc(truncate(page.title || '—', 52))}</div></td>
    <td>${lengthBadge(page.title, 10, 70, 'Tajuk')}</td>
    <td>${lengthBadge(page.description, 50, 170, 'Description')}</td>
    <td>${page.canonical ? statusBadge('pass', 'Ada') : statusBadge('warn', 'Tiada')}</td>
    <td>${page.og_title && page.og_description ? statusBadge('pass', 'Lengkap') : statusBadge('warn', 'Separa')}</td>
    <td><span class="pill">${esc(page.robots || '—')}</span></td>
    <td>${page.h1 === 1 ? statusBadge('pass', '1 H1') : statusBadge(page.h1 ? 'warn' : 'fail', `${page.h1 || 0} H1`)}</td>
  </tr>`;
}

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const pages = s.pages || [];
  const checks = s.checks || [];
  const seoChecks = checks.filter((check) => check.category === 'seo' || check.category === 'a11y');
  const lighthouse = s.lighthouse || [];
  const lhSeo = lighthouse.filter((item) => item.ok && typeof item.scores?.seo === 'number');
  const avgSeo = lhSeo.length ? Math.round(lhSeo.reduce((sum, item) => sum + item.scores.seo, 0) / lhSeo.length) : null;
  const canonicalMissing = pages.filter((page) => !page.canonical).length;
  const ogMissing = pages.filter((page) => !page.og_title || !page.og_description).length;
  const issues = pages.reduce((sum, page) => sum + (page.issues || []).filter((item) => ['canonical', 'og', 'title', 'description', 'h1', 'lang'].includes(item.code)).length, 0);

  root.innerHTML = `
    ${pageHead(
      'SEO & kebolehcapaian',
      'Metadata, tajuk, deskripsi, bahasa, alt text dan skor Lighthouse untuk halaman awam.',
      `<a class="btn btn--ghost btn--sm" href="#/prestasi">${icon('gauge', 14)} Prestasi</a>`,
    )}

    <section class="grid grid--kpi">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Skor SEO Lighthouse</span><span class="kpi__icon">${icon('search', 17)}</span></div><div class="kpi__value">${avgSeo ?? '—'}</div><div class="kpi__meta">${lhSeo.length ? `Purata ${lhSeo.length} halaman` : 'Lighthouse belum dijalankan'}</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Canonical</span><span class="kpi__icon kpi__icon--warn">${icon('link', 17)}</span></div><div class="kpi__value">${pages.length - canonicalMissing}/${pages.length}</div><div class="kpi__meta">${canonicalMissing} halaman tiada canonical</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Open Graph</span><span class="kpi__icon kpi__icon--warn">${icon('globe', 17)}</span></div><div class="kpi__value">${pages.length - ogMissing}/${pages.length}</div><div class="kpi__meta">${ogMissing} halaman tidak lengkap</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Isu metadata</span><span class="kpi__icon kpi__icon--warn">${icon('alert', 17)}</span></div><div class="kpi__value">${issues}</div><div class="kpi__meta">Tajuk, deskripsi, OG, H1</div></article>
    </section>

    <section class="grid grid--2 section-gap">
      <article class="card">
        ${cardHead('Skor SEO mengikut halaman', 'Lighthouse mudah alih')}
        ${lhSeo.length ? `<div class="lh-score-list">${lhSeo.map((item) => `<div class="lh-score-row">
          <span class="lh-score-row__label">${esc(item.label)}</span>
          ${donut(item.scores.seo, { size: 66, stroke: 6, sublabel: '', label: `SEO ${item.label}`, light: true, tone: true })}
          <span class="lh-score-row__value">${item.scores.seo}</span>
        </div>`).join('')}</div>` : `<div class="notice">${icon('gauge', 16)} Jalankan <code>npm run audit:full</code> untuk skor Lighthouse.</div>`}
      </article>

      <article class="card">
        ${cardHead('Semakan SEO & akses', 'Status semakan berkaitan')}
        <div class="check-list check-list--compact">
          ${seoChecks.map((check) => `<div class="compact-check">
            <div class="compact-check__head">${statusBadge(check.status)}<span>${esc(check.label)}</span></div>
            <div class="compact-check__meta">${esc(check.detail || '')}</div>
          </div>`).join('')}
        </div>
      </article>
    </section>

    <article class="card section-gap">
      ${cardHead('Metadata halaman', 'Panjang tajuk 10–70 aksara, deskripsi 50–170 aksara')}
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Halaman</th><th>Tajuk</th><th>Panjang</th><th>Description</th>
            <th>Canonical</th><th>OG</th><th>Robots</th><th>H1</th>
          </tr></thead>
          <tbody>${pages.map(seoRow).join('')}</tbody>
        </table>
      </div>
    </article>

    <section class="grid grid--2 section-gap">
      <article class="card">
        ${cardHead('Cadangan tindakan', 'Keutamaan SEO dan akses')}
        <ol class="detail-list detail-list--numbered">
          <li>Tetapkan <code>canonical</code> untuk setiap halaman awam.</li>
          <li>Lengkapkan <code>og:title</code>, <code>og:description</code> dan <code>og:image</code> untuk paparan perkongsian.</li>
          <li>Pastikan setiap halaman mempunyai satu H1 dan alt text yang bermakna.</li>
          <li>Kekalkan <code>noindex, nofollow</code> semasa fasa draf; buang selepas pelancaran disahkan.</li>
          <li>Semak kontras warna dan fokus papan kekunci melalui Lighthouse.</li>
        </ol>
      </article>

      <article class="card">
        ${cardHead('Akses & bahasa', 'Ringkasan atribut halaman')}
        <div class="kv-list">
          ${pages.map((page) => `<div class="kv-row">
            <span class="mono">${esc(page.path || '/')}</span>
            <span>${statusBadge(page.lang === 'ms' ? 'pass' : 'warn', page.lang || 'tiada lang')}</span>
            <span>${page.viewport ? statusBadge('pass', 'viewport') : statusBadge('warn', 'tiada viewport')}</span>
            <span>${page.skip_link ? statusBadge('pass', 'skip link') : statusBadge('warn', 'tiada skip')}</span>
          </div>`).join('')}
        </div>
      </article>
    </section>
  `;
}
