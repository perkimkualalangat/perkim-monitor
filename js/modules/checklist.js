import { state } from '../core/data.js';
import {
  icon, esc, pageHead, cardHead, showToast, downloadJSON, debounce,
  percent, fmtDate,
} from '../core/ui.js';

const STORAGE_KEY = 'perkim-monitor-checklist-v1';
const STATUS_CYCLE = ['belum', 'sedang', 'selesai'];
const STATUS_LABEL = { belum: 'Belum', sedang: 'Sedang', selesai: 'Selesai' };

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { versi: 1, updated_at: null, items: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.items !== 'object') {
      return { versi: 1, updated_at: null, items: {} };
    }
    return parsed;
  } catch {
    return { versi: 1, updated_at: null, items: {} };
  }
}

function save(saved) {
  saved.updated_at = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function stateFor(item, saved) {
  const custom = saved.items?.[item.id];
  const base = {
    status: STATUS_CYCLE.includes(item.status) ? item.status : 'belum',
    tarikh: item.tarikh || null,
    nota: item.nota || '',
  };
  if (!custom) return base;
  return {
    status: STATUS_CYCLE.includes(custom.status) ? custom.status : base.status,
    tarikh: custom.tarikh !== undefined ? custom.tarikh : base.tarikh,
    nota: custom.nota !== undefined ? custom.nota : base.nota,
  };
}

function statusIcon(status) {
  if (status === 'selesai') return icon('check', 13);
  if (status === 'sedang') return icon('clock', 13);
  return '';
}

export async function render(root) {
  const seed = state.checklist;
  if (!seed || !Array.isArray(seed.kumpulan)) {
    root.innerHTML = `<div class="notice notice--warn">Fail data/checklist.json tidak tersedia.</div>`;
    return;
  }

  let saved = loadSaved();
  const groups = seed.kumpulan;
  const allItems = groups.flatMap((group) => group.item || []);

  root.innerHTML = `
    ${pageHead(
      'Checklist operasi',
      'Tanda selesai disimpan dalam pelayar ini sahaja. Gunakan eksport/import untuk pindah antara peranti.',
      `<button class="btn btn--ghost btn--sm" type="button" id="checklist-export">${icon('download', 14)} Eksport</button>
       <button class="btn btn--ghost btn--sm" type="button" id="checklist-import">${icon('upload', 14)} Import</button>
       <button class="btn btn--ghost btn--sm" type="button" id="checklist-reset">${icon('rotate', 14)} Reset</button>
       <input type="file" id="checklist-file" accept="application/json,.json" hidden>`,
    )}

    <section class="checklist-summary">
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Selesai</span><span class="kpi__icon">${icon('check', 17)}</span></div><div class="kpi__value" id="count-selesai">0</div><div class="kpi__meta">Daripada ${allItems.length} item</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Sedang</span><span class="kpi__icon kpi__icon--warn">${icon('clock', 17)}</span></div><div class="kpi__value" id="count-sedang">0</div><div class="kpi__meta">Sedang diusahakan</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Belum</span><span class="kpi__icon kpi__icon--muted">${icon('list', 17)}</span></div><div class="kpi__value" id="count-belum">0</div><div class="kpi__meta">Belum bermula</div></article>
      <article class="card kpi"><div class="kpi__top"><span class="kpi__label">Kemajuan</span><span class="kpi__icon">${icon('activity', 17)}</span></div><div class="kpi__value" id="count-percent">0%</div><div class="kpi__meta"><div class="progress" style="margin-top:6px"><div class="progress__bar" id="checklist-progress" style="width:0%"></div></div></div></article>
    </section>

    <article class="card">
      ${cardHead('Senarai semak', `Dikemas kini ${seed.dikemaskini || '—'} · ${groups.length} kumpulan`)}
      <div class="filter-bar">
        <input class="input" type="search" id="checklist-search" placeholder="Cari item, pemilik atau nota…" aria-label="Cari item checklist">
        <select class="select" id="checklist-status" aria-label="Tapis status">
          <option value="">Semua status</option>
          <option value="belum">Belum</option>
          <option value="sedang">Sedang</option>
          <option value="selesai">Selesai</option>
        </select>
        <select class="select" id="checklist-group" aria-label="Tapis kumpulan">
          <option value="">Semua kumpulan</option>
          ${groups.map((group) => `<option value="${esc(group.id)}">${esc(group.tajuk)}</option>`).join('')}
        </select>
        <span class="filter-count" id="checklist-count">${allItems.length} item</span>
      </div>
      <div id="checklist-groups"></div>
      <div class="empty" id="checklist-empty" hidden>${icon('search', 38)}<h3>Tiada item sepadan</h3><p>Cuba tukar penapis atau kata carian.</p></div>
    </article>

    <article class="card section-gap">
      <div class="notice">${icon('help', 16)} Status asal daripada <code>data/checklist.json</code> bertindak sebagai benih. Perubahan anda disimpan dalam <code>localStorage</code> pelayar ini. Menghapuskan data pelayar akan reset checklist.</div>
      <div class="small muted" id="checklist-saved" style="margin-top:8px"></div>
    </article>
  `;

  const groupsContainer = root.querySelector('#checklist-groups');
  const search = root.querySelector('#checklist-search');
  const statusFilter = root.querySelector('#checklist-status');
  const groupFilter = root.querySelector('#checklist-group');
  const empty = root.querySelector('#checklist-empty');
  const countLabel = root.querySelector('#checklist-count');
  const savedLabel = root.querySelector('#checklist-saved');

  function computeCounts() {
    const counts = { belum: 0, sedang: 0, selesai: 0 };
    for (const item of allItems) {
      const value = stateFor(item, saved).status;
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  }

  function paint() {
    const counts = computeCounts();
    root.querySelector('#count-selesai').textContent = counts.selesai;
    root.querySelector('#count-sedang').textContent = counts.sedang;
    root.querySelector('#count-belum').textContent = counts.belum;
    const progress = percent(counts.selesai, allItems.length);
    root.querySelector('#count-percent').textContent = `${progress}%`;
    root.querySelector('#checklist-progress').style.width = `${progress}%`;

    groupsContainer.innerHTML = groups.map((group) => {
      const items = group.item || [];
      const done = items.filter((item) => stateFor(item, saved).status === 'selesai').length;
      return `<section class="checklist-group" data-group="${esc(group.id)}">
        <div class="checklist-group__head">
          <div class="checklist-group__title">${icon(group.ikon || 'list', 17)} ${esc(group.tajuk)}</div>
          <span class="pill">${done}/${items.length} selesai</span>
        </div>
        <div class="checklist-items">
          ${items.map((item) => {
            const value = stateFor(item, saved);
            return `<div class="checklist-item" data-status="${esc(value.status)}" data-group="${esc(group.id)}" data-search="${esc(`${item.tajuk} ${item.pemilik || ''} ${value.nota || ''}`.toLowerCase())}">
              <button class="check-status" type="button" data-id="${esc(item.id)}" data-status="${esc(value.status)}" aria-label="${esc(`Tukar status: ${item.tajuk}. Semasa ${STATUS_LABEL[value.status]}`)}" title="Klik untuk tukar status">
                ${statusIcon(value.status)}
              </button>
              <div class="checklist-item__body">
                <div class="checklist-item__title">${esc(item.tajuk)}</div>
                <div class="checklist-item__meta">
                  <span>${esc(item.pemilik || 'Tiada pemilik')}</span>
                  <span>·</span>
                  <span>${esc(STATUS_LABEL[value.status])}</span>
                  ${value.tarikh ? `<span>·</span><span>${esc(fmtDate(value.tarikh))}</span>` : ''}
                </div>
                ${value.nota ? `<div class="checklist-item__note">${esc(value.nota)}</div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </section>`;
    }).join('');

    savedLabel.textContent = saved.updated_at
      ? `Terakhir disimpan: ${new Date(saved.updated_at).toLocaleString('ms-MY')}`
      : 'Belum ada perubahan tempatan.';

    applyFilter();
  }

  function applyFilter() {
    const query = search.value.trim().toLowerCase();
    const status = statusFilter.value;
    const group = groupFilter.value;
    let visible = 0;
    let total = 0;

    for (const groupEl of groupsContainer.querySelectorAll('.checklist-group')) {
      let groupVisible = 0;
      for (const item of groupEl.querySelectorAll('.checklist-item')) {
        total += 1;
        const matches = (!query || item.dataset.search.includes(query))
          && (!status || item.dataset.status === status)
          && (!group || item.dataset.group === group);
        item.hidden = !matches;
        if (matches) {
          visible += 1;
          groupVisible += 1;
        }
      }
      groupEl.hidden = groupVisible === 0;
    }

    countLabel.textContent = `${visible} daripada ${total} item`;
    empty.hidden = visible > 0;
  }

  groupsContainer.addEventListener('click', (event) => {
    const button = event.target.closest('.check-status');
    if (!button) return;
    const id = button.dataset.id;
    const item = allItems.find((entry) => entry.id === id);
    if (!item) return;
    const current = stateFor(item, saved);
    const index = STATUS_CYCLE.indexOf(current.status);
    const next = STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length];
    saved.items[id] = {
      status: next,
      tarikh: next === 'selesai' ? today() : null,
      nota: current.nota,
    };
    save(saved);
    paint();
    showToast(`${item.tajuk}: ${STATUS_LABEL[next]}.`, next === 'selesai' ? 'success' : 'info');
  });

  search.addEventListener('input', debounce(applyFilter, 120));
  statusFilter.addEventListener('change', applyFilter);
  groupFilter.addEventListener('change', applyFilter);

  root.querySelector('#checklist-export').addEventListener('click', () => {
    const items = Object.fromEntries(allItems.map((item) => [item.id, stateFor(item, saved)]));
    downloadJSON(`perkim-checklist-${today()}.json`, {
      versi: 1,
      sumber: 'perkim-monitor',
      dieksport: new Date().toISOString(),
      items,
    });
    showToast('Checklist dieksport.', 'success');
  });

  const fileInput = root.querySelector('#checklist-file');
  root.querySelector('#checklist-import').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      let imported = {};
      if (parsed && typeof parsed.items === 'object' && !Array.isArray(parsed.items)) {
        imported = parsed.items;
      } else if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.id) imported[item.id] = item;
        }
      } else if (parsed && Array.isArray(parsed.kumpulan)) {
        for (const group of parsed.kumpulan) {
          for (const item of group.item || []) {
            if (item && item.id) imported[item.id] = item;
          }
        }
      } else {
        throw new Error('Format fail tidak dikenali.');
      }

      let count = 0;
      for (const [id, value] of Object.entries(imported)) {
        if (!allItems.some((item) => item.id === id)) continue;
        if (!value || !STATUS_CYCLE.includes(value.status)) continue;
        saved.items[id] = {
          status: value.status,
          tarikh: value.tarikh || (value.status === 'selesai' ? today() : null),
          nota: value.nota || '',
        };
        count += 1;
      }
      if (!count) throw new Error('Tiada item checklist yang sah dalam fail.');
      save(saved);
      paint();
      showToast(`${count} item checklist diimport.`, 'success');
    } catch (error) {
      showToast(`Import gagal: ${error.message}`, 'danger');
    } finally {
      fileInput.value = '';
    }
  });

  root.querySelector('#checklist-reset').addEventListener('click', () => {
    if (!window.confirm('Reset semua status checklist kepada nilai asal? Perubahan tempatan akan hilang.')) return;
    localStorage.removeItem(STORAGE_KEY);
    saved = { versi: 1, updated_at: null, items: {} };
    paint();
    showToast('Checklist telah direset.', 'info');
  });

  paint();
}
