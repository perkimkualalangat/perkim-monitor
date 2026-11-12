import { state } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, statusBadge, fmtDateTime, fmtRelative,
  fmtMs, fmtNumber, emptyState,
} from '../core/ui.js';

function runTone(run) {
  if (!run) return 'unknown';
  if (run.conclusion === 'success') return 'pass';
  if (run.status === 'in_progress' || run.status === 'queued') return 'warn';
  return 'fail';
}

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const deploy = s.deploy || {};
  const runs = deploy.runs || [];
  const deployChecks = (s.checks || []).filter((check) => check.id.startsWith('deploy.') || check.id === 'uptime.current' || check.id === 'live.pages');
  const uptime = s.uptime?.current || null;
  const actionsTone = runTone(deploy.actions);

  root.innerHTML = `
    ${pageHead(
      'Deploy & operasi',
      'Status commit, GitHub Actions, Pages dan ketersediaan laman utama.',
      `<a class="btn btn--ghost btn--sm" href="${esc(state.config?.pautan?.actions || '#')}" target="_blank" rel="noopener">${icon('external', 14)} GitHub Actions</a>
       <a class="btn btn--primary btn--sm" href="${esc(s.site?.url || '#')}" target="_blank" rel="noopener">${icon('external', 14)} Laman live</a>`,
    )}

    <section class="deploy-grid">
      <article class="card deploy-tile deploy-tile--card">
        <div class="deploy-tile__label">${icon('git', 13)} Commit terakhir</div>
        <div class="deploy-tile__value mono">${esc(deploy.sha || '—')}</div>
        <div class="deploy-tile__meta">${esc(deploy.commit_message || deploy.error || 'Tiada maklumat commit')}</div>
        <div class="deploy-tile__meta">${deploy.commit_date ? esc(fmtDateTime(deploy.commit_date)) : '—'}</div>
      </article>
      <article class="card deploy-tile deploy-tile--card">
        <div class="deploy-tile__label">${icon('activity', 13)} GitHub Actions</div>
        <div class="deploy-tile__value">${deploy.actions ? statusBadge(actionsTone, deploy.actions.conclusion || deploy.actions.status || '—') : statusBadge('unknown', 'Tiada run')}</div>
        <div class="deploy-tile__meta">${esc(deploy.actions?.name || '—')}</div>
        <div class="deploy-tile__meta">${deploy.actions?.updated_at ? esc(fmtRelative(deploy.actions.updated_at)) : '—'}</div>
      </article>
      <article class="card deploy-tile deploy-tile--card">
        <div class="deploy-tile__label">${icon('uploadCloud', 13)} GitHub Pages</div>
        <div class="deploy-tile__value">${statusBadge(deploy.pages?.status === 'built' ? 'pass' : 'warn', deploy.pages?.status || 'unknown')}</div>
        <div class="deploy-tile__meta">${esc(deploy.pages?.build_type || '—')}</div>
        <div class="deploy-tile__meta">${deploy.pages?.updated_at ? esc(fmtRelative(deploy.pages.updated_at)) : '—'}</div>
      </article>
      <article class="card deploy-tile deploy-tile--card">
        <div class="deploy-tile__label">${icon('globe', 13)} Ketersediaan</div>
        <div class="deploy-tile__value">${uptime ? statusBadge(uptime.ok ? (uptime.ms > 2500 ? 'warn' : 'pass') : 'fail', uptime.ok ? `HTTP ${uptime.status}` : 'Gagal') : statusBadge('unknown', 'Tiada data')}</div>
        <div class="deploy-tile__meta">${esc(fmtMs(uptime?.ms))}</div>
        <div class="deploy-tile__meta">${uptime ? esc(fmtRelative(uptime.at)) : '—'}</div>
      </article>
    </section>

    <section class="grid grid--2 section-gap">
      <article class="card">
        ${cardHead('Aliran deploy', 'Dari commit ke laman live')}
        <ol class="deploy-flow">
          <li class="deploy-flow__step deploy-flow__step--done">
            <span class="deploy-flow__num">1</span>
            <div><strong>Push ke main</strong><div class="small muted">Commit ${esc(deploy.sha || '—')} diterima.</div></div>
          </li>
          <li class="deploy-flow__step ${actionsTone === 'pass' ? 'deploy-flow__step--done' : ''}">
            <span class="deploy-flow__num">2</span>
            <div><strong>GitHub Actions</strong><div class="small muted">Audit, snapshot data dan artifact Pages.</div></div>
          </li>
          <li class="deploy-flow__step ${deploy.pages?.status === 'built' ? 'deploy-flow__step--done' : ''}">
            <span class="deploy-flow__num">3</span>
            <div><strong>GitHub Pages</strong><div class="small muted">Artifact diterbitkan ke ${esc(s.site?.url || '')}.</div></div>
          </li>
          <li class="deploy-flow__step ${uptime?.ok ? 'deploy-flow__step--done' : ''}">
            <span class="deploy-flow__num">4</span>
            <div><strong>Semakan live</strong><div class="small muted">${uptime?.ok ? 'Laman boleh diakses.' : 'Menunggu semakan.'}</div></div>
          </li>
        </ol>
      </article>

      <article class="card">
        ${cardHead('Semakan deploy', 'Status yang berkaitan dengan penerbitan')}
        <div class="check-list check-list--compact">
          ${deployChecks.map((check) => `<div class="compact-check">
            <div class="compact-check__head">${statusBadge(check.status)}<span>${esc(check.label)}</span></div>
            <div class="compact-check__meta">${esc(check.detail || '')}</div>
          </div>`).join('') || `<div class="notice">${icon('help', 16)} Tiada semakan deploy.</div>`}
        </div>
      </article>
    </section>

    <article class="card section-gap">
      ${cardHead('Sejarah GitHub Actions', '5 run terakhir pada branch utama')}
      ${runs.length
        ? `<div class="timeline">${runs.map((run) => `<div class="timeline-item">
          <div class="timeline-item__time">${esc(fmtRelative(run.updated_at))}</div>
          <div class="timeline-item__dot timeline-item__dot--${runTone(run)}"></div>
          <div class="timeline-item__body">
            <div><strong>${esc(run.name || 'Workflow')}</strong> ${statusBadge(runTone(run), run.conclusion || run.status || '—')}</div>
            <div class="timeline-item__meta">${esc(run.sha || '—')} · <a href="${esc(run.url)}" target="_blank" rel="noopener">Lihat run</a></div>
          </div>
        </div>`).join('')}</div>`
        : `<div class="empty">${icon('uploadCloud', 38)}<h3>Tiada run GitHub Actions</h3><p>Workflow audit akan muncul selepas repo diterbitkan.</p></div>`}
    </article>

    <article class="card section-gap">
      ${cardHead('Pautan operasi', 'Akses pantas')}
      <div class="pill-list">
        <a class="btn btn--ghost btn--sm" href="${esc(state.config?.pautan?.github || '#')}" target="_blank" rel="noopener">${icon('git', 13)} Repo monitor</a>
        <a class="btn btn--ghost btn--sm" href="${esc(state.config?.pautan?.actions || '#')}" target="_blank" rel="noopener">${icon('activity', 13)} Actions</a>
        <a class="btn btn--ghost btn--sm" href="${esc(state.config?.pautan?.pages || '#')}" target="_blank" rel="noopener">${icon('globe', 13)} Dashboard live</a>
        <a class="btn btn--ghost btn--sm" href="${esc(s.site?.url || '#')}" target="_blank" rel="noopener">${icon('external', 13)} Website PERKIM</a>
      </div>
    </article>
  `;
}
