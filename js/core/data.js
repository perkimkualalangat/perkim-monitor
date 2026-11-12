/**
 * data.js — pemuat data JSON untuk dashboard.
 *
 * Semua fail dimuatkan secara relatif daripada folder `data/`.
 * Jika satu fail pilihan gagal, dashboard tetap berfungsi dengan
 * data lain dan merekod ralat untuk dipaparkan di UI.
 */

export const state = {
  status: null,
  history: [],
  uptime: null,
  checklist: null,
  config: null,
  dbIndex: null,
  dbCache: new Map(),
  errors: [],
  loadedAt: null,
  refreshCount: 0,
};

let cacheBust = '';

async function fetchJson(path, { required = false, cache = true } = {}) {
  const url = `${path}${cacheBust ? `?v=${cacheBust}` : ''}`;
  try {
    const response = await fetch(url, {
      cache: cache ? 'default' : 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (required) throw new Error(`${path}: ${error.message}`);
    state.errors.push({ file: path, message: error.message });
    return null;
  }
}

function normalizeHistory(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.history)) return value.history;
  return [];
}

function normalizeUptime(value) {
  if (!value) return null;
  if (Array.isArray(value)) return { generated_at: null, current: value.at(-1) || null, history: value };
  return value;
}

export async function loadCore({ refresh = false } = {}) {
  state.errors = [];
  if (refresh) {
    state.refreshCount += 1;
    cacheBust = String(Date.now());
  }

  const [status, history, uptime, checklist, config, dbIndex] = await Promise.all([
    fetchJson('data/status.json', { required: true, cache: !refresh }),
    fetchJson('data/history.json', { cache: !refresh }),
    fetchJson('data/uptime.json', { cache: !refresh }),
    fetchJson('data/checklist.json', { cache: !refresh }),
    fetchJson('data/config.json', { cache: !refresh }),
    fetchJson('data/db/index.json', { cache: !refresh }),
  ]);

  state.status = status;
  state.history = normalizeHistory(history);
  state.uptime = normalizeUptime(uptime);
  state.checklist = checklist;
  state.config = config;
  state.dbIndex = dbIndex;
  state.dbCache.clear();
  state.loadedAt = new Date().toISOString();
  return state;
}

export async function loadDatabaseFile(name) {
  if (!name) throw new Error('Nama fail tidak diberikan.');
  if (state.dbCache.has(name)) return state.dbCache.get(name);
  const value = await fetchJson(`data/db/${encodeURIComponent(name)}`, {
    required: true,
    cache: false,
  });
  state.dbCache.set(name, value);
  return value;
}

export function websiteUrl(relative = '') {
  const base = state.status?.site?.url || state.config?.site?.url || 'https://perkimkualalangat.github.io/Website-PERKIM/';
  try {
    return new URL(relative || '', base).href;
  } catch {
    return base;
  }
}

export function findCheck(id) {
  return (state.status?.checks || []).find((check) => check.id === id) || null;
}

export function checksFor(ids) {
  const wanted = new Set(ids);
  return (state.status?.checks || []).filter((check) => wanted.has(check.id));
}

export function category(id) {
  return (state.status?.categories || []).find((item) => item.id === id) || null;
}

export function historyScores() {
  return state.history
    .map((entry) => ({ at: entry.at, score: entry.score }))
    .filter((entry) => typeof entry.score === 'number');
}

export function dbFiles() {
  return state.dbIndex?.files || [];
}

export function formatAge(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'baru sahaja';
  if (minutes < 60) return `${minutes} min lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  return `${days} hari lalu`;
}
