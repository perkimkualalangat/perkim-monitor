import { state, historyScores } from '../core/data.js';
import {
  icon, esc, fmtDateTime, fmtRelative, statusBadge, scoreBadge,
  progressClass, pageHead, cardHead, fmtNumber, scoreStatus,
} from '../core/ui.js';
import { donut, sparkline, categoryRows } from '../core/charts.js';

function kpi(label, value, meta, iconName) {
  return `<article class="card kpi">
    <div class="kpi__top">
      <span class="kpi__label">${esc(label)}</span>
      <span class="kpi__icon">${icon(iconName, 17)}</span>
    </div>
    <div class="kpi__value">${esc(value)}</div>
    <div class="kpi__meta">${esc(meta)}</div>
  </article>`;
}

function attentionItem(check) {
  const tone = check.status === 'fail' ? 'fail' : 'warn';
  return `<a class="attention-item" href="#/semakan">
    <span class="attention-item__icon attention-item__icon--${tone}">${icon(tone === 'fail' ? 'x' : 'alert', 14)}</span>
    <span class="attention-item__body">
      <span class="attention-item__title">${esc(check.label)}</span>
      <span class="attention-item__meta">${esc(check.detail || check.id)}</span>
    </span>
    ${statusBadge(check.status)}
  </a>`;
}

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const summary = s.summary || {};
  const pages = s.pages || [];
  const programs = s.programs || { items: [] };
  const books = s.books || [];
  const links = s.links || [];
  const checks = s.checks || [];
  const categories = summary.categories || [];
  const history = historyScores();
  const scores = history.map((entry) => entry.score);
  const okPages = pages.filter((page) => page.ok).length;
  const okBooks = books.filter((book) => book.pdf_ok && book.cover_ok).length;
  const linkFails = links.filter((link) => link.level === 'fail').length;
  const linkWarns = links.filter((link) => link.level === 'warn').length;
  const attention = checks
    .filter((check) => check.status === 'fail' || check.status === 'warn')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'fail' ? -1 : 1))
    .slice(0, 6);
  const deploy = s.deploy || {};
  const uptime = s.uptime?.current || null;
  const phase = s.site?.phase === 'live' ? 'Live' : 'Draf';

  root.innerHTML = `
    ${pageHead(
      'Ringkasan pemantauan',
      `Gambaran keseluruhan laman ${s.site?.name || 'PERKIM'} pada ${fmtDateTime(s.generated_at)}.`,
      `<button class="btn btn--ghost btn--sm" type="button" data-export-status>${icon('download', 14)} Eksport status</button>
       <a class="btn btn--primary btn--sm" href="${esc(s.site?.url || '#')}" target="_blank" rel="noopener">${icon('external', 14)} Buka laman</a>`,
    )}

    <section class="grid grid--hero">
      <article class="card hero-card">
        <div class="hero-card__grid">
          <div>
            <div class="badge-row">
              <span class="badge ${s.site?.phase === 'live' ? 'badge--pass' : 'badge--gold'}">${esc(phase)}</span>
              <span class="badge badge--unknown">${icon('git', 11)} ${esc(s.site?.sha || 'tiada sha')}</span>
            </div>
            <h2>${esc(s.site?.short_name || s.site?.name || 'PERKIM Kuala Langat')}</h2>
            <p>${esc(s.site?.url || '')}</p>
            <div class="hero-card__meta">
              <span>${icon('clock', 13)} Audit ${esc(fmtRelative(s.generated_at))}</span>
              <span>${icon('activity', 13)} ${fmtNumber(s.duration_ms ? Math.round(s.duration_ms / 1000) : null)}s</span>
              <span>${icon('checkSquare', 13)} ${summary.checks || 0} semakan</span>
              <span>${icon('server', 13)} ${okPages}/${pages.length} halaman live</span>
            </div>
          </div>
          <div class="hero-score">
            ${donut(summary.score ?? 0, { size: 152, stroke: 13, label: 'Skor keseluruhan', sublabel: 'Skor' })}
            ${scoreBadge(summary.score, scoreStatus(summary.score) === 'pass' ? 'Sihat' : scoreStatus(summary.score) === 'warn' ? 'Sederhana' : 'Perlu perhatian')}
          </div>
        </div>
      </article>

      <article class="card">
        ${cardHead('Kategori', 'Skor mengikut bidang pemantauan')}
        ${categoryRows(categories)}
      </article>
    </section>

    <section class="grid grid--kpi section-gap">
      ${kpi('Halaman live', `${okPages}/${pages.length}`, 'Respons HTTP 200', 'pages')}
      ${kpi('Program', fmtNumber(programs.total || 0), `${programs.sorotan || 0} sorotan · ${programs.draf || 0} draf`, 'calendar')}
      ${kpi('Buku R2', `${okBooks}/${books.length}`, 'PDF dan cover boleh diakses', 'book')}
      ${kpi('Pautan disemak', fmtNumber(links.length), linkFails || linkWarns ? `${linkFails} gagal · ${linkWarns} amaran` : 'Semua pautan sihat', 'link')}
    </section>

    <section class="grid grid--2 section-gap">
      <article class="card">
        ${cardHead('Perlu perhatian', 'Semakan yang memerlukan tindakan', `<a class="card__link" href="#/semakan">Lihat semua</a>`)}
        ${attention.length
          ? `<div class="attention-list">${attention.map(attentionItem).join('')}</div>`
          : `<div class="notice notice--success">${icon('check', 16)} Semua semakan lulus. Tiada amaran atau kegagalan.</div>`}
      </article>

      <article class="card">
        ${cardHead('Trend skor', 'Sejarah audit terakhir', `<a class="card__link" href="#/sejarah">Sejarah penuh</a>`)}
        ${scores.length > 1
          ? sparkline(scores, {
            height: 172,
            label: 'Trend skor audit',
            min: Math.max(0, Math.min(...scores) - 5),
            max: Math.min(100, Math.max(...scores) + 5),
          })
          : `<div class="notice">${icon('history', 16)} Trend akan terbentuk selepas beberapa audit. Jalankan audit secara berkala melalui GitHub Actions.</div>`}
        <div class="trend-legend">
          <span>${scores.length ? `Audit terakhir: <strong>${scores.at(-1)}</strong>/100` : 'Tiada sejarah'}</span>
          <span>${history.length ? `${history.length} rekod` : ''}</span>
        </div>
      </article>
    </section>

    <section class="grid grid--3 section-gap">
      <article class="card">
        ${cardHead('Deploy', 'Commit dan GitHub Actions')}
        <div class="deploy-grid deploy-grid--single">
          <div class="deploy-tile">
            <div class="deploy-tile__label">Commit</div>
            <div class="deploy-tile__value mono">${esc(deploy.sha || '—')}</div>
            <div class="deploy-tile__meta">${esc(deploy.commit_message || deploy.error || 'Tiada maklumat')}</div>
          </div>
          <div class="deploy-tile">
            <div class="deploy-tile__label">Actions</div>
            <div class="deploy-tile__value">${deploy.actions ? statusBadge(deploy.actions.conclusion === 'success' ? 'pass' : deploy.actions.status === 'in_progress' ? 'warn' : 'fail', deploy.actions.conclusion || deploy.actions.status || '—') : statusBadge('unknown', 'Tiada run')}</div>
            <div class="deploy-tile__meta">${esc(deploy.actions?.name || '—')}</div>
          </div>
          <div class="deploy-tile">
            <div class="deploy-tile__label">Pages</div>
            <div class="deploy-tile__value">${statusBadge(deploy.pages?.status === 'built' ? 'pass' : 'warn', deploy.pages?.status || 'unknown')}</div>
            <div class="deploy-tile__meta">${esc(deploy.pages?.build_type || '—')}</div>
          </div>
        </div>
      </article>

      <article class="card">
        ${cardHead('Ketersediaan', 'Semakan uptime terkini')}
        <div class="uptime-block">
          <div class="uptime-value">${uptime ? `${uptime.ms ?? '—'} <span>ms</span>` : '—'}</div>
          <div class="uptime-meta">
            ${uptime ? statusBadge(uptime.ok ? (uptime.ms > 2500 ? 'warn' : 'pass') : 'fail', uptime.ok ? `HTTP ${uptime.status}` : 'Tidak dapat diakses') : statusBadge('unknown', 'Tiada data')}
            <span>${uptime ? esc(fmtRelative(uptime.at)) : '—'}</span>
          </div>
        </div>
        <div class="notice section-gap-sm">${icon('activity', 16)} Uptime disemak setiap kali audit dijalankan. Untuk semakan 5 minit, gunakan perkhidmatan luar seperti UptimeRobot.</div>
      </article>

      <article class="card">
        ${cardHead('Sorotan program', `${programs.sorotan || 0} program disorot`)}
        ${(programs.items || []).length
          ? `<div class="mini-program-list">${programs.items
            .filter((item) => item.sorotan)
            .sort((a, b) => a.sorotan - b.sorotan)
            .map((item) => `<div class="mini-program">
              <span class="mini-program__num">${item.sorotan}</span>
              <div>
                <div class="mini-program__title">${esc(item.tajuk)}</div>
                <div class="mini-program__meta">${esc(item.kategori || '—')} · ${esc(item.status || '—')}</div>
              </div>
            </div>`).join('')}</div>`
          : `<div class="notice">${icon('calendar', 16)} Tiada program disorot.</div>`}
        <a class="card__link section-gap-sm" href="#/program">Lihat semua program</a>
      </article>
    </section>
  `;

  root.querySelector('[data-export-status]')?.addEventListener('click', async () => {
    const { downloadJSON, showToast } = await import('../core/ui.js');
    downloadJSON(`perkim-status-${new Date().toISOString().slice(0, 10)}.json`, s);
    showToast('Status audit dieksport.', 'success');
  });
}
