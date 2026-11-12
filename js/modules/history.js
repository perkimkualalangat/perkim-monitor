import { state, historyScores } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, fmtDateTime, fmtRelative, statusBadge,
  fmtMs, fmtNumber, showToast, downloadJSON, emptyState,
} from '../core/ui.js';
import { sparkline } from '../core/charts.js';

export async function render(root) {
  const s = state.status;
  if (!s) {
    root.innerHTML = `<div class="notice notice--warn">Data status tidak tersedia.</div>`;
    return;
  }

  const history = state.history || [];
  const scores = historyScores();
  const scoreValues = scores.map((entry) => entry.score);
  const uptime = state.uptime || { history: [] };
  const uptimeHistory = Array.isArray(uptime.history) ? uptime.history : [];
  const uptimeMs = uptimeHistory.map((entry) => entry.ms).filter((value) => typeof value === 'number');
  const best = scoreValues.length ? Math.max(...scoreValues) : null;
  const worst = scoreValues.length ? Math.min(...scoreValues) : null;
  const latest = scoreValues.at(-1) ?? null;
  const delta = scoreValues.length > 1 ? latest - scoreValues.at(-2) : null;

  root.innerHTML = `
    ${pageHead(
      'Sejarah audit',
      `${history.length} rekod audit disimpan. Setiap audit GitHub Actions menambah satu titik data.`,
      `<button class="btn btn--ghost btn--sm" type="button" id="history-export">${icon('download', 14)} Eksport sejarah</button>`,
    )}

    <section class="grid grid--kpi">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Skor terkini</span><span class="kpi__icon">${icon('gauge', 17)}</span></div><div class="kpi__value">${latest ?? '—'}</div><div class="kpi__meta">${delta === null ? 'Tiada perbandingan' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} mata berbanding audit lalu`}</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Skor terbaik</span><span class="kpi__icon">${icon('check', 17)}</span></div><div class="kpi__value">${best ?? '—'}</div><div class="kpi__meta">Sepanjang sejarah</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Skor terendah</span><span class="kpi__icon kpi__icon--warn">${icon('alert', 17)}</span></div><div class="kpi__value">${worst ?? '—'}</div><div class="kpi__meta">Sepanjang sejarah</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Rekod uptime</span><span class="kpi__icon">${icon('activity', 17)}</span></div><div class="kpi__value">${fmtNumber(uptimeHistory.length)}</div><div class="kpi__meta">Semakan ketersediaan</div></article>
    </section>

    <article class="card section-gap">
      ${cardHead('Trend skor keseluruhan', 'Skor 0–100 mengikut masa audit')}
      ${scoreValues.length > 1
        ? sparkline(scoreValues, {
          height: 210,
          label: 'Trend skor audit',
          min: Math.max(0, Math.min(...scoreValues) - 5),
          max: Math.min(100, Math.max(...scoreValues) + 5),
        })
        : `<div class="notice">${icon('history', 16)} Hanya ${scoreValues.length} rekod tersedia. Trend akan muncul selepas audit seterusnya.</div>`}
    </article>

    <section class="grid grid--2 section-gap">
      <article class="card">
        ${cardHead('Masa respons', 'Uptime laman utama (ms)')}
        ${uptimeMs.length > 1
          ? sparkline(uptimeMs, { height: 170, min: 0, max: Math.max(...uptimeMs, 1), label: 'Trend masa respons' })
          : `<div class="notice">${icon('activity', 16)} Data uptime belum mencukupi.</div>`}
      </article>

      <article class="card">
        ${cardHead('Ketersediaan terkini', 'Semakan terakhir laman utama')}
        <div class="kv-list">
          <div class="kv-row"><span>Status</span><span>${uptime.current ? statusBadge(uptime.current.ok ? 'pass' : 'fail', uptime.current.ok ? `HTTP ${uptime.current.status}` : 'Gagal') : statusBadge('unknown', 'Tiada data')}</span></div>
          <div class="kv-row"><span>Masa respons</span><span>${esc(fmtMs(uptime.current?.ms))}</span></div>
          <div class="kv-row"><span>Disemak</span><span>${esc(uptime.current ? fmtDateTime(uptime.current.at) : '—')}</span></div>
          <div class="kv-row"><span>Jumlah semakan</span><span>${fmtNumber(uptimeHistory.length)}</span></div>
        </div>
        <div class="notice section-gap-sm">${icon('help', 16)} Uptime disemak setiap kali audit berjalan. Untuk pemantauan setiap 5 minit, gunakan UptimeRobot atau perkhidmatan serupa.</div>
      </article>
    </section>

    <article class="card section-gap">
      ${cardHead('Rekod audit', 'Klik butiran untuk melihat skor kategori')}
      ${history.length
        ? `<div class="table-wrap"><table>
          <thead><tr><th>Tarikh</th><th class="num">Skor</th><th class="num">Lulus</th><th class="num">Amaran</th><th class="num">Gagal</th><th class="num">Tempoh</th><th>Commit</th><th>Kategori</th></tr></thead>
          <tbody>${[...history].reverse().map((entry) => `<tr>
            <td><div class="table-title">${esc(fmtDateTime(entry.at))}</div><div class="table-sub">${esc(fmtRelative(entry.at))}</div></td>
            <td class="num"><strong>${esc(entry.score ?? '—')}</strong></td>
            <td class="num">${esc(entry.pass ?? '—')}</td>
            <td class="num">${esc(entry.warn ?? '—')}</td>
            <td class="num">${esc(entry.fail ?? '—')}</td>
            <td class="num nowrap">${entry.duration_ms ? `${(entry.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
            <td class="mono">${esc(entry.sha || '—')}</td>
            <td>${entry.categories ? `<details><summary>${Object.keys(entry.categories).length} kategori</summary><ul class="detail-list">${Object.entries(entry.categories).map(([key, value]) => `<li>${esc(key)}: ${esc(value ?? '—')}</li>`).join('')}</ul></details>` : '—'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`
        : `<div class="empty">${icon('history', 38)}<h3>Tiada sejarah</h3><p>Jalankan audit untuk mula merekod trend.</p></div>`}
    </article>
  `;

  root.querySelector('#history-export')?.addEventListener('click', () => {
    downloadJSON(`perkim-history-${new Date().toISOString().slice(0, 10)}.json`, {
      exported_at: new Date().toISOString(),
      history,
      uptime: uptimeHistory,
    });
    showToast('Sejarah audit dieksport.', 'success');
  });
}
