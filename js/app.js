/**
 * app.js — shell, router dan navigasi dashboard.
 */
import { icon, esc, fmtRelative, showToast, statusBadge } from './core/ui.js';
import { loadCore, state } from './core/data.js';

const ROUTES = [
  {
    id: 'ringkasan',
    title: 'Ringkasan',
    subtitle: 'Gambaran kesihatan laman web',
    group: 'Pemantauan',
    icon: 'dashboard',
    module: 'overview',
  },
  {
    id: 'semakan',
    title: 'Status Semakan',
    subtitle: 'Semua pemeriksaan audit dan butirannya',
    group: 'Pemantauan',
    icon: 'checkSquare',
    module: 'checks',
  },
  {
    id: 'halaman',
    title: 'Halaman',
    subtitle: 'Prestasi dan kualiti setiap halaman awam',
    group: 'Pemantauan',
    icon: 'pages',
    module: 'pages',
  },
  {
    id: 'program',
    title: 'Program',
    subtitle: 'Program cawangan, sorotan dan galeri',
    group: 'Pemantauan',
    icon: 'calendar',
    module: 'programs',
  },
  {
    id: 'bahan-bacaan',
    title: 'Bahan Bacaan',
    subtitle: 'Buku, PDF dan cover R2',
    group: 'Pemantauan',
    icon: 'book',
    module: 'books',
  },
  {
    id: 'pautan',
    title: 'Pautan & Aset',
    subtitle: 'Semakan pautan dalaman dan luaran',
    group: 'Kualiti',
    icon: 'link',
    module: 'links',
  },
  {
    id: 'seo',
    title: 'SEO & Kebolehcapaian',
    subtitle: 'Metadata, bahasa, alt text dan Lighthouse',
    group: 'Kualiti',
    icon: 'search',
    module: 'seo',
  },
  {
    id: 'prestasi',
    title: 'Prestasi',
    subtitle: 'Masa respons, saiz dan skor Lighthouse',
    group: 'Kualiti',
    icon: 'gauge',
    module: 'performance',
  },
  {
    id: 'pangkalan-data',
    title: 'Pangkalan Data',
    subtitle: 'Snapshot JSON yang dijana oleh audit',
    group: 'Data & Rekod',
    icon: 'database',
    module: 'database',
  },
  {
    id: 'sejarah',
    title: 'Sejarah Audit',
    subtitle: 'Trend skor dan ketersediaan laman',
    group: 'Data & Rekod',
    icon: 'history',
    module: 'history',
  },
  {
    id: 'checklist',
    title: 'Checklist',
    subtitle: 'Senarai semak operasi dan pematuhan',
    group: 'Data & Rekod',
    icon: 'list',
    module: 'checklist',
  },
  {
    id: 'deploy',
    title: 'Deploy',
    subtitle: 'Commit, GitHub Actions dan Pages',
    group: 'Operasi',
    icon: 'uploadCloud',
    module: 'deploy',
  },
  {
    id: 'keselamatan',
    title: 'Keselamatan',
    subtitle: 'Token, data awam dan pematuhan',
    group: 'Operasi',
    icon: 'shield',
    module: 'security',
  },
  {
    id: 'tetapan',
    title: 'Tetapan',
    subtitle: 'Konfigurasi audit dan maklumat sistem',
    group: 'Operasi',
    icon: 'settings',
    module: 'settings',
  },
];

const GROUPS = ['Pemantauan', 'Kualiti', 'Data & Rekod', 'Operasi'];
const THEME_KEY = 'perkim-monitor-theme';
const main = document.getElementById('main');
const nav = document.getElementById('nav');
const pageTitle = document.getElementById('page-title');
const lastUpdated = document.getElementById('last-updated');
const footerMeta = document.getElementById('footer-meta');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebar-backdrop');
const menuButton = document.getElementById('menu-btn');
const themeButton = document.getElementById('theme-btn');
const refreshButton = document.getElementById('refresh-btn');

let currentId = null;
let rendering = false;

function routeFromHash() {
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0].trim();
  return ROUTES.find((route) => route.id === raw) || ROUTES[0];
}

function navBadge(route) {
  if (route.id !== 'semakan' || !state.status) return '';
  const { warn = 0, fail = 0 } = state.status.summary || {};
  const count = warn + fail;
  return count ? `<span class="nav-link__badge">${count}</span>` : '';
}

function renderNav() {
  nav.innerHTML = GROUPS.map((group) => {
    const items = ROUTES.filter((route) => route.group === group);
    if (!items.length) return '';
    return `<div class="nav-group">
      <div class="nav-group__label">${esc(group)}</div>
      ${items.map((route) => `
        <a class="nav-link${route.id === currentId ? ' is-active' : ''}" href="#/${route.id}" data-route="${route.id}"${route.id === currentId ? ' aria-current="page"' : ''}>
          ${icon(route.icon, 17)}
          <span>${esc(route.title)}</span>
          ${navBadge(route)}
        </a>
      `).join('')}
    </div>`;
  }).join('');
}

function updateChrome(route) {
  pageTitle.textContent = route.title;
  document.title = `${route.title} · PERKIM Monitor`;
  renderNav();
  if (state.status) {
    lastUpdated.textContent = `Dikemas kini ${fmtRelative(state.status.generated_at)}`;
    const meta = state.status.meta || {};
    footerMeta.textContent = `v${meta.version || '1.0.0'} · ${state.status.duration_ms ? `${(state.status.duration_ms / 1000).toFixed(1)}s` : '—'} · ${state.status.site?.sha || 'tiada sha'}`;
  } else {
    lastUpdated.textContent = 'Data belum dimuatkan';
    footerMeta.textContent = '—';
  }
}

function closeSidebar() {
  document.body.classList.remove('sidebar-open');
  menuButton?.setAttribute('aria-expanded', 'false');
  if (backdrop) backdrop.hidden = true;
}

function openSidebar() {
  document.body.classList.add('sidebar-open');
  menuButton?.setAttribute('aria-expanded', 'true');
  if (backdrop) backdrop.hidden = false;
}

function loadingMarkup(message = 'Memuatkan data pemantauan…') {
  return `<div class="loading"><div><div class="spinner" aria-hidden="true"></div><p>${esc(message)}</p></div></div>`;
}

async function renderRoute(route) {
  if (rendering) return;
  rendering = true;
  currentId = route.id;
  updateChrome(route);
  closeSidebar();
  main.innerHTML = loadingMarkup();
  try {
    const module = await import(`./modules/${route.module}.js`);
    if (typeof module.render !== 'function') {
      throw new Error(`Modul ${route.module} tidak mempunyai fungsi render.`);
    }
    await module.render(main, { route, state, navigate });
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error(error);
    main.innerHTML = `<div class="card">
      <div class="notice notice--danger">
        <div>
          <strong>Gagal memuatkan halaman ini.</strong>
          <p class="small" style="margin:6px 0 0">${esc(error.message)}</p>
          <p class="small" style="margin:6px 0 0">Pastikan anda membuka dashboard melalui pelayan HTTP, bukan fail terus. Jalankan <code>start-monitor.bat</code> atau <code>npm run serve</code>.</p>
        </div>
      </div>
    </div>`;
  } finally {
    rendering = false;
  }
}

function navigate(id) {
  if (location.hash === `#/${id}`) {
    renderRoute(routeFromHash());
    return;
  }
  location.hash = `#/${id}`;
}

function applyTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = value;
  localStorage.setItem(THEME_KEY, value);
  if (themeButton) {
    themeButton.innerHTML = icon(value === 'dark' ? 'sun' : 'moon', 17);
    themeButton.setAttribute('aria-label', value === 'dark' ? 'Tukar ke tema cerah' : 'Tukar ke tema gelap');
    themeButton.setAttribute('title', value === 'dark' ? 'Tema cerah' : 'Tema gelap');
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', value === 'dark' ? '#0a1410' : '#14532d');
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

async function refreshData() {
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.classList.add('is-loading');
  }
  try {
    await loadCore({ refresh: true });
    showToast('Data pemantauan dimuat semula.', 'success');
    await renderRoute(routeFromHash());
  } catch (error) {
    showToast(`Gagal memuat semula: ${error.message}`, 'danger');
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.classList.remove('is-loading');
    }
  }
}

function initEvents() {
  window.addEventListener('hashchange', () => renderRoute(routeFromHash()));

  menuButton?.addEventListener('click', () => {
    if (document.body.classList.contains('sidebar-open')) closeSidebar();
    else openSidebar();
  });
  backdrop?.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar();
  });

  themeButton?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  refreshButton?.addEventListener('click', refreshData);

  nav.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-route]');
    if (link && window.matchMedia?.('(max-width: 980px)').matches) closeSidebar();
  });
}

async function boot() {
  initTheme();
  initEvents();
  renderNav();
  main.innerHTML = loadingMarkup('Memuatkan data pemantauan…');
  try {
    await loadCore();
  } catch (error) {
    console.error(error);
    main.innerHTML = `<div class="card">
      <div class="empty">
        <div class="empty__icon">${icon('alert', 44)}</div>
        <h3>Data pemantauan belum tersedia</h3>
        <p>Fail <code>data/status.json</code> tidak dapat dimuatkan. Jalankan audit terlebih dahulu:</p>
        <pre class="code-block" style="text-align:left;max-width:560px;margin:14px auto 0">npm install
node tools/audit.mjs --site ../perkim-web --lighthouse
node tools/serve.mjs 8082</pre>
        <p class="small" style="margin-top:12px">${esc(error.message)}</p>
      </div>
    </div>`;
    lastUpdated.textContent = 'Data tiada';
    return;
  }

  if (state.errors.length) {
    console.warn('Sebahagian data gagal dimuatkan:', state.errors);
  }

  renderNav();
  await renderRoute(routeFromHash());
}

boot();
