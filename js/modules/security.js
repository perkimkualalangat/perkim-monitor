import { state } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, statusBadge, fmtNumber, percent,
} from '../core/ui.js';

const STORAGE_KEY = 'perkim-monitor-checklist-v1';

function itemText(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item ?? '');
  return ['fail', 'mesej', 'message', 'jenis', 'baris', 'page', 'label']
    .filter((key) => item[key] !== undefined && item[key] !== null && item[key] !== '')
    .map((key) => String(item[key]))
    .join(' · ');
}

function checklistProgress() {
  const seed = state.checklist;
  if (!seed?.kumpulan) return null;
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').items || {};
  } catch {
    saved = {};
  }
  const group = seed.kumpulan.find((item) => item.id === 'keselamatan');
  if (!group) return null;
  const items = group.item || [];
  const done = items.filter((item) => (saved[item.id]?.status || item.status) === 'selesai').length;
  return { total: items.length, done, percent: percent(done, items.length) };
}

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const checks = s.checks || [];
  const securityChecks = checks.filter((check) => check.category === 'keselamatan' || check.id === 'static.sensitive' || check.id === 'live.a11y');
  const sensitiveCheck = checks.find((check) => check.id === 'static.sensitive');
  const findings = sensitiveCheck?.items || [];
  const progress = checklistProgress();
  const publicChecks = checks.filter((check) => check.status === 'pass').length;

  root.innerHTML = `
    ${pageHead(
      'Keselamatan',
      'Token, data awam, integriti aset dan pematuhan operasi. Dashboard ini sendiri awam dan baca-sahaja.',
      `<a class="btn btn--ghost btn--sm" href="#/checklist">${icon('list', 14)} Checklist keselamatan</a>`,
    )}

    <section class="grid grid--kpi">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Token dalam repo</span><span class="kpi__icon">${icon('shield', 17)}</span></div><div class="kpi__value">${findings.length ? findings.length : '0'}</div><div class="kpi__meta">${findings.length ? 'Penemuan sensitif dikesan' : 'Tiada token atau kunci'}</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Semakan lulus</span><span class="kpi__icon">${icon('check', 17)}</span></div><div class="kpi__value">${publicChecks}/${checks.length}</div><div class="kpi__meta">Keseluruhan audit</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Checklist keselamatan</span><span class="kpi__icon">${icon('list', 17)}</span></div><div class="kpi__value">${progress ? `${progress.percent}%` : '—'}</div><div class="kpi__meta">${progress ? `${progress.done}/${progress.total} item selesai` : 'Tiada checklist'}</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Data sensitif</span><span class="kpi__icon">${icon('eye', 17)}</span></div><div class="kpi__value">${findings.length ? 'Semak' : 'Tiada'}</div><div class="kpi__meta">Dashboard awam, baca-sahaja</div></article>
    </section>

    ${findings.length ? `<div class="notice notice--danger section-gap">${icon('alert', 16)} <div><strong>${findings.length} penemuan sensitif.</strong> Buang token/kunci daripada repo serta-merta dan revoke token tersebut.</div></div>` : ''}

    <section class="grid grid--2 section-gap">
      <article class="card">
        ${cardHead('Semakan keselamatan', 'Status semakan berkaitan')}
        <div class="check-list check-list--compact">
          ${securityChecks.map((check) => `<div class="compact-check">
            <div class="compact-check__head">${statusBadge(check.status)}<span>${esc(check.label)}</span></div>
            <div class="compact-check__meta">${esc(check.detail || '')}</div>
            ${check.items?.length ? `<details><summary>${check.items.length} butiran</summary><ul class="detail-list">${check.items.map((item) => `<li>${esc(itemText(item))}</li>`).join('')}</ul></details>` : ''}
          </div>`).join('') || `<div class="notice">${icon('help', 16)} Tiada semakan keselamatan.</div>`}
        </div>
      </article>

      <article class="card">
        ${cardHead('Amalan token', 'Wajib dipatuhi')}
        <ul class="detail-list">
          <li>Jangan simpan PAT dalam fail repo, <code>.git/config</code>, atau pemboleh ubah workflow yang boleh dibaca.</li>
          <li>Gunakan <code>GITHUB_TOKEN</code> automatik dalam GitHub Actions, bukan PAT peribadi.</li>
          <li>Hadkan skop token kepada <code>repo</code> dan <code>workflow</code> sahaja.</li>
          <li>Revoke/regenerate sebarang token yang pernah dipaparkan dalam chat, log atau screenshot.</li>
          <li>Semak <code>git remote -v</code> sebelum push untuk memastikan tiada token tertanam.</li>
        </ul>
        <div class="notice notice--warn section-gap-sm">${icon('alert', 16)} Token yang pernah terdedah mesti dianggap tidak selamat walaupun repo telah dibersihkan.</div>
      </article>
    </section>

    <section class="grid grid--2 section-gap">
      <article class="card">
        ${cardHead('Data awam', 'Apa yang dipaparkan dashboard ini')}
        <div class="kv-list">
          <div class="kv-row"><span>Status</span><span>${statusBadge('pass', 'Baca-sahaja')}</span></div>
          <div class="kv-row"><span>Log masuk</span><span>Tiada</span></div>
          <div class="kv-row"><span>Data sensitif</span><span>Tiada</span></div>
          <div class="kv-row"><span>Pangkalan data</span><span>Snapshot JSON awam</span></div>
          <div class="kv-row"><span>Checklist</span><span>localStorage pelayar</span></div>
        </div>
        <div class="notice section-gap-sm">${icon('help', 16)} Jangan letak maklumat peribadi, nombor telefon individu atau dokumen dalaman dalam repo ini.</div>
      </article>

      <article class="card">
        ${cardHead('Penyelenggaraan', 'Arahan semakan berkala')}
        <pre class="code-block"># Audit dependency
npm audit

# Semak remote tanpa token
git remote -v

# Cari corak token dalam repo
rg "ghp_|github_pat_|AKIA" -n

# Jalankan audit penuh
npm run audit:full</pre>
        <div class="notice section-gap-sm">${icon('clock', 16)} Jalankan semakan keselamatan sekurang-kurangnya sebulan sekali dan selepas setiap perubahan workflow.</div>
      </article>
    </section>
  `;
}
