import { state, findCheck } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, statusBadge, scoreBadge, fmtMs, fmtBytes,
  fmtNumber, scoreStatus,
} from '../core/ui.js';
import { donut } from '../core/charts.js';

const LH_LABELS = {
  performance: 'Prestasi',
  accessibility: 'Akses',
  'best-practices': 'Amalan',
  seo: 'SEO',
};

function lhCard(item) {
  if (!item.ok) {
    return `<article class="lh-card">
      <div class="lh-card__head"><h3>${esc(item.label)}</h3>${statusBadge('fail', 'Gagal')}</div>
      <p class="small muted">${esc(item.error || 'Lighthouse tidak dapat dijalankan.')}</p>
    </article>`;
  }
  const metrics = item.metrics || {};
  return `<article class="lh-card">
    <div class="lh-card__head">
      <div><h3>${esc(item.label)}</h3><div class="mono small muted">${esc(item.url)}</div></div>
      ${scoreBadge(item.scores?.performance, '')}
    </div>
    <div class="lh-scores">
      ${Object.entries(LH_LABELS).map(([key, label]) => {
        const score = item.scores?.[key];
        return `<div class="lh-score">
          ${donut(score ?? 0, { size: 76, stroke: 7, sublabel: '', label: `${label} ${item.label}`, light: true, tone: true })}
          <span class="lh-score__label">${esc(label)}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="lh-metrics">
      <span><strong>${fmtMs(metrics.fcp)}</strong> FCP</span>
      <span><strong>${fmtMs(metrics.lcp)}</strong> LCP</span>
      <span><strong>${typeof metrics.cls === 'number' ? metrics.cls.toFixed(3) : '—'}</strong> CLS</span>
      <span><strong>${fmtMs(metrics.tbt)}</strong> TBT</span>
    </div>
  </article>`;
}

function msBar(page, max) {
  const value = page.ms || 0;
  const width = max ? Math.max(2, Math.round((value / max) * 100)) : 0;
  const tone = value > (state.config?.ambang?.masa_ms || 2500) * 2 ? 'fail' : value > (state.config?.ambang?.masa_ms || 2500) ? 'warn' : 'pass';
  return `<div class="bar-row">
    <span class="bar-row__label">${esc(page.label || page.path || '/')}</span>
    <div class="bar-track"><div class="bar-fill bar-fill--${tone}" style="width:${width}%"></div></div>
    <span class="bar-row__value">${esc(fmtMs(value))}</span>
  </div>`;
}

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const lighthouse = s.lighthouse || [];
  const lhOk = lighthouse.filter((item) => item.ok);
  const avg = (key) => {
    const values = lhOk.map((item) => item.scores?.[key]).filter((value) => typeof value === 'number');
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  const performance = avg('performance');
  const accessibility = avg('accessibility');
  const bestPractices = avg('best-practices');
  const pages = [...(s.pages || [])].sort((a, b) => (b.ms || 0) - (a.ms || 0));
  const maxMs = Math.max(...pages.map((page) => page.ms || 0), 1);
  const largeImages = findCheck('static.large_images');
  const largeItems = largeImages?.items || [];
  const totalHtml = pages.reduce((sum, page) => sum + (page.bytes || 0), 0);

  root.innerHTML = `
    ${pageHead(
      'Prestasi',
      'Masa respons live, saiz HTML, gambar besar dan skor Lighthouse mudah alih.',
      `<a class="btn btn--ghost btn--sm" href="#/seo">${icon('search', 14)} SEO & akses</a>`,
    )}

    <section class="grid grid--kpi">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Prestasi</span><span class="kpi__icon">${icon('gauge', 17)}</span></div><div class="kpi__value">${performance ?? '—'}</div><div class="kpi__meta">${lhOk.length ? `Lighthouse ${lhOk.length} halaman` : 'Belum dijalankan'}</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Kebolehcapaian</span><span class="kpi__icon">${icon('accessibility', 17)}</span></div><div class="kpi__value">${accessibility ?? '—'}</div><div class="kpi__meta">Skor Lighthouse</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Amalan terbaik</span><span class="kpi__icon">${icon('shield', 17)}</span></div><div class="kpi__value">${bestPractices ?? '—'}</div><div class="kpi__meta">Skor Lighthouse</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Saiz HTML</span><span class="kpi__icon">${icon('code', 17)}</span></div><div class="kpi__value">${esc(fmtBytes(totalHtml))}</div><div class="kpi__meta">${fmtNumber(pages.length)} halaman live</div></article>
    </section>

    <article class="card section-gap">
      ${cardHead('Lighthouse', 'Skor mudah alih untuk halaman terpilih')}
      ${lighthouse.length
        ? `<div class="lh-grid">${lighthouse.map(lhCard).join('')}</div>`
        : `<div class="notice">${icon('gauge', 16)} Lighthouse belum dijalankan. Jalankan <code>npm run audit:full</code> atau biarkan workflow GitHub Actions menjalankannya.</div>`}
      ${lighthouse.length && s.site?.phase === 'draf'
        ? `<div class="notice notice--warn section-gap-sm">${icon('help', 16)} Skor SEO Lighthouse rendah kerana halaman masih <code>noindex, nofollow</code> semasa fasa draf. Skor ini tidak dikira sebagai kegagalan dalam ringkasan keseluruhan.</div>`
        : ''}
    </article>

    <section class="grid grid--2 section-gap">
      <article class="card">
        ${cardHead('Masa respons live', 'Semakin rendah semakin baik')}
        <div class="bar-list">${pages.map((page) => msBar(page, maxMs)).join('')}</div>
        <div class="notice section-gap-sm">${icon('clock', 16)} Had amaran: ${esc(state.config?.ambang?.masa_ms || 2500)} ms. Nilai diukur dari pelayan audit, bukan peranti pengguna.</div>
      </article>

      <article class="card">
        ${cardHead('Gambar besar', `Ambang ${esc(state.config?.ambang?.gambar_kb || 500)} KB`)}
        ${largeItems.length
          ? `<div class="table-wrap"><table><thead><tr><th>Fail</th><th class="num">Saiz</th></tr></thead><tbody>${largeItems.map((item) => `<tr><td class="mono">${esc(item.fail)}</td><td class="num">${esc(item.kb)} KB</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="notice notice--success">${icon('check', 16)} Semua gambar bawah ambang.</div>`}
        <div class="notice section-gap-sm">${icon('help', 16)} Mampatkan gambar sebelum commit. Untuk slaid program, sasarkan 1080×1350 dan bawah 500 KB.</div>
      </article>
    </section>

    <article class="card section-gap">
      ${cardHead('Saiz dan struktur halaman', 'HTML live berbanding fail statik')}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Halaman</th><th class="num">HTML live</th><th class="num">Fail statik</th><th class="num">Imej</th><th class="num">Pautan</th><th>Status</th></tr></thead>
          <tbody>${pages.map((page) => `<tr>
            <td><div class="table-title">${esc(page.label || page.path || 'Halaman Utama')}</div><div class="table-sub mono">${esc(page.path || '/')}</div></td>
            <td class="num nowrap">${esc(fmtBytes(page.bytes))}</td>
            <td class="num nowrap">${esc(page.static?.bytes ? fmtBytes(page.static.bytes) : '—')}</td>
            <td class="num">${esc(page.images ?? 0)}</td>
            <td class="num">${esc((page.internal_links || 0) + (page.external_links || 0))}</td>
            <td>${statusBadge(page.ok ? 'pass' : 'fail', page.ok ? `HTTP ${page.status}` : 'Gagal')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </article>
  `;
}
