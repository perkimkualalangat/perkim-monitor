#!/usr/bin/env node
/**
 * audit.mjs — orkestrator pemantauan PERKIM.
 *
 * Guna:
 *   node tools/audit.mjs --site ../perkim-web
 *   node tools/audit.mjs --site ../perkim-web --lighthouse
 *
 * Output:
 *   data/status.json
 *   data/history.json
 *   data/uptime.json
 *   data/db/*.json
 *   data/db/index.json
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as cheerio from 'cheerio';
import { runLighthouse, chromeLabel } from './lib/lighthouse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_DIR = path.join(DATA_DIR, 'db');
const USER_AGENT = 'PERKIM-Monitor/1.0 (+https://github.com/perkimkualalangat/perkim-monitor)';
const WARN_DOMAINS = [
  'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be',
  'wa.me', 'linktr.ee', 'google.com/maps',
];
const DB_FILES = [
  'site.json', 'books.json', 'aktiviti.json', 'kepimpinan.json',
  'berita.json', 'perkim-network.json', 'search-index.json',
  'perkim.json', 'sitemap.json', 'motion.json',
];
const DB_LABELS = {
  'site.json': 'Maklumat Laman',
  'books.json': 'Bahan Bacaan & PDF',
  'aktiviti.json': 'Program & Sorotan',
  'kepimpinan.json': 'Kepimpinan',
  'berita.json': 'Berita Kebangsaan',
  'perkim-network.json': 'Jaringan PERKIM',
  'search-index.json': 'Indeks Carian',
  'perkim.json': 'Profil PERKIM',
  'sitemap.json': 'Sitemap',
  'motion.json': 'Token Gerakan',
  'perkim-ringkasan.json': 'Ringkasan PERKIM',
};
const CATEGORY_DEFS = [
  {
    id: 'pautan', label: 'Pautan & Aset', weight: 0.18,
    checks: ['static.links', 'static.css', 'live.internal_links', 'live.external_links'],
  },
  {
    id: 'data', label: 'Data & Program', weight: 0.14,
    checks: ['static.json', 'static.program', 'static.sorotan'],
  },
  {
    id: 'r2', label: 'PDF & R2', weight: 0.08,
    checks: ['r2.pdf', 'r2.cover'],
  },
  {
    id: 'seo', label: 'SEO', weight: 0.13,
    checks: ['static.title', 'static.description', 'static.robots', 'static.seo', 'live.titles', 'live.descriptions', 'live.seo'],
    lighthouse: ['seo'],
  },
  {
    id: 'a11y', label: 'Kebolehcapaian', weight: 0.13,
    checks: ['static.lang', 'static.alt', 'static.a11y', 'live.lang', 'live.alt', 'live.a11y'],
    lighthouse: ['accessibility'],
  },
  {
    id: 'prestasi', label: 'Prestasi', weight: 0.13,
    checks: ['static.large_images', 'live.response_time', 'live.html_size', 'lighthouse.performance', 'lighthouse.best_practices'],
    lighthouse: ['performance', 'best-practices'],
  },
  {
    id: 'deploy', label: 'Deploy', weight: 0.10,
    checks: ['deploy.commit', 'deploy.actions', 'deploy.pages', 'live.pages', 'uptime.current'],
  },
  {
    id: 'keselamatan', label: 'Keselamatan', weight: 0.06,
    checks: ['static.sensitive'],
  },
  {
    id: 'teknikal', label: 'Teknikal', weight: 0.05,
    checks: ['static.html', 'static.viewport', 'static.temp_files'],
  },
];

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const siteArg = arg('--site', '../perkim-web');
const configArg = arg('--config', 'data/config.json');
const outArg = arg('--out', 'data/status.json');
const useLighthouse = process.argv.includes('--lighthouse') && !process.argv.includes('--no-lighthouse');
const siteRoot = path.resolve(process.cwd(), siteArg);
const configPath = path.resolve(ROOT, configArg);
const outPath = path.resolve(ROOT, outArg);
let config = null;
let pages = [];

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function fmtKB(bytes) {
  return `${Math.round(bytes / 102.4) / 10} KB`;
}

function makeCheck(id, label, status, category, detail = '', items = []) {
  return { id, label, status, category, detail, items };
}

function issue(code, severity, message) {
  return { code, severity, message };
}

function worst(statuses) {
  const rank = { unknown: 0, pass: 1, warn: 2, fail: 3 };
  return statuses.reduce((acc, item) => (rank[item] > rank[acc] ? item : acc), 'unknown');
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: process.env,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

async function runStatic() {
  const staticPath = path.join(DATA_DIR, '.static.json');
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const script = path.join(ROOT, 'tools', 'check_static.py');
  const config = await readJson(configPath, {});
  const result = await runCommand(python, [
    script,
    '--site', siteRoot,
    '--phase', config.site?.fasa || 'draf',
    '--image-kb', String(config.ambang?.gambar_kb || 500),
    '--out', staticPath,
  ], { cwd: ROOT });
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `check_static.py keluar dengan kod ${result.code}`);
  }
  const data = await readJson(staticPath);
  if (!data) throw new Error('check_static.py tidak menghasilkan JSON yang sah.');
  await fs.rm(staticPath, { force: true });
  return data;
}

function countRecords(name, data) {
  if (name === 'books.json') {
    let count = 0;
    for (const group of data?.kumpulan || []) count += (group.buku || []).length;
    return count;
  }
  if (name === 'kepimpinan.json') return (data?.jawatan || []).length;
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') return Object.keys(data).length;
  return 1;
}

function recordLabel(name) {
  if (name === 'books.json') return 'buku';
  if (name === 'kepimpinan.json') return 'jawatan';
  if (name === 'sitemap.json') return 'seksyen';
  return 'rekod';
}

async function copyDatabase() {
  await fs.mkdir(DB_DIR, { recursive: true });
  const files = [];
  for (const name of DB_FILES) {
    const source = path.join(siteRoot, 'data', name);
    if (!existsSync(source)) continue;
    const target = path.join(DB_DIR, name);
    await fs.copyFile(source, target);
    const data = await readJson(source);
    const stat = await fs.stat(source);
    files.push({
      name,
      label: DB_LABELS[name] || name,
      source: `data/${name}`,
      bytes: stat.size,
      records: countRecords(name, data),
      record_label: recordLabel(name),
      type: Array.isArray(data) ? 'array' : typeof data,
    });
  }
  const ringkasanSource = path.join(siteRoot, 'data', 'perkim', 'ringkasan.json');
  if (existsSync(ringkasanSource)) {
    const target = path.join(DB_DIR, 'perkim-ringkasan.json');
    await fs.copyFile(ringkasanSource, target);
    const data = await readJson(ringkasanSource);
    const stat = await fs.stat(ringkasanSource);
    files.push({
      name: 'perkim-ringkasan.json',
      label: DB_LABELS['perkim-ringkasan.json'],
      source: 'data/perkim/ringkasan.json',
      bytes: stat.size,
      records: countRecords('perkim-ringkasan.json', data),
      record_label: recordLabel('perkim-ringkasan.json'),
      type: Array.isArray(data) ? 'array' : typeof data,
    });
  }
  const index = { generated_at: isoNow(), files };
  await writeJson(path.join(DB_DIR, 'index.json'), index);
  return index;
}

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const headers = { 'User-Agent': USER_AGENT, ...(options.headers || {}) };
  return fetch(url, {
    redirect: 'follow',
    ...options,
    headers,
    signal: AbortSignal.timeout(timeout),
  });
}

function absoluteUrl(relative) {
  return new URL(relative || '', config.site.url).href;
}

function pageLabel(relative) {
  const page = config.halaman.find((item) => item.path === relative);
  return page?.label || relative || 'Halaman Utama';
}

function classifyLink(href, base) {
  if (!href) return null;
  const value = href.trim();
  if (!value || value.startsWith('#') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:') || value.startsWith('data:')) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin === new URL(config.site.url).origin ? 'internal' : 'external';
  } catch {
    return null;
  }
}

async function checkPage(pageConfig) {
  const url = absoluteUrl(pageConfig.path);
  const started = performance.now();
  let response;
  let html = '';
  try {
    response = await fetchWithTimeout(url, { headers: { Accept: 'text/html' } }, config.audit?.timeout_ms || 15000);
    html = await response.text();
  } catch (error) {
    const ms = Math.round(performance.now() - started);
    return {
      path: pageConfig.path,
      label: pageConfig.label,
      kategori: pageConfig.kategori,
      url,
      status: 0,
      ok: false,
      ms,
      bytes: 0,
      title: '',
      description: '',
      lang: '',
      robots: '',
      noindex: false,
      h1: 0,
      viewport: false,
      skip_link: false,
      images: 0,
      missing_alt: 0,
      empty_alt: 0,
      internal_links: 0,
      external_links: 0,
      canonical: '',
      og_title: '',
      og_description: '',
      links: [],
      issues: [issue('status', 'fail', `Gagal memuat: ${error.message}`)],
    };
  }

  const ms = Math.round(performance.now() - started);
  const bytes = Buffer.byteLength(html, 'utf8');
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim().replace(/\s+/g, ' ');
  const description = ($('meta[name="description"]').attr('content') || '').trim();
  const robots = ($('meta[name="robots"]').attr('content') || '').trim().toLowerCase();
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDescription = $('meta[property="og:description"]').attr('content') || '';
  const lang = ($('html').attr('lang') || '').trim();
  const viewport = $('meta[name="viewport"]').length > 0;
  const skipLink = $('.skip-link').length > 0 || $('a[href="#main"]').length > 0;
  const h1 = $('h1').length;
  const imageElements = $('img').toArray();
  let missingAlt = 0;
  let emptyAlt = 0;
  for (const element of imageElements) {
    const alt = $(element).attr('alt');
    if (alt === undefined) missingAlt += 1;
    else if (!alt.trim()) emptyAlt += 1;
  }

  const links = [];
  $('a[href]').each((_, element) => {
    const href = ($(element).attr('href') || '').trim();
    const kind = classifyLink(href, url);
    if (!kind) return;
    links.push({
      href,
      kind,
      url: new URL(href, url).href,
      text: $(element).text().trim().replace(/\s+/g, ' ').slice(0, 90),
    });
  });

  const issues = [];
  if (!response.ok) issues.push(issue('status', 'fail', `HTTP ${response.status}`));
  if (ms > (config.ambang?.masa_ms || 2500)) {
    issues.push(issue('slow', 'warn', `Respons ${ms} ms melebihi ${config.ambang.masa_ms} ms`));
  }
  if (bytes > (config.ambang?.html_kb || 300) * 1024) {
    issues.push(issue('large', 'warn', `HTML ${fmtKB(bytes)} melebihi ${config.ambang.html_kb} KB`));
  }
  if (!title) issues.push(issue('title', 'fail', 'Tiada tajuk'));
  else if (title.length < 10 || title.length > 70) issues.push(issue('title', 'warn', `Panjang tajuk ${title.length} aksara`));
  if (!description) issues.push(issue('description', 'warn', 'Tiada meta description'));
  else if (description.length < 50 || description.length > 170) issues.push(issue('description', 'warn', `Panjang description ${description.length} aksara`));
  if (h1 === 0) issues.push(issue('h1', 'fail', 'Tiada H1'));
  else if (h1 > 1) issues.push(issue('h1', 'warn', `${h1} H1 dijumpai`));
  if (lang.toLowerCase() !== 'ms') issues.push(issue('lang', 'warn', `lang="${lang}"`));
  if (!viewport) issues.push(issue('viewport', 'warn', 'Tiada meta viewport'));
  const noindex = robots.includes('noindex');
  if (config.site.fasa === 'draf' && !noindex) issues.push(issue('robots', 'warn', 'Fasa draf tetapi tiada noindex'));
  if (config.site.fasa === 'live' && noindex) issues.push(issue('robots', 'warn', 'Fasa live tetapi masih noindex'));
  if (missingAlt) issues.push(issue('alt', 'fail', `${missingAlt} imej tiada atribut alt`));
  if (emptyAlt) issues.push(issue('empty_alt', 'warn', `${emptyAlt} imej alt kosong (dekoratif?)`));
  if (!canonical) issues.push(issue('canonical', 'warn', 'Tiada canonical'));
  if (!ogTitle) issues.push(issue('og', 'warn', 'Tiada og:title'));
  if (!ogDescription) issues.push(issue('og', 'warn', 'Tiada og:description'));
  if (!skipLink) issues.push(issue('skip_link', 'warn', 'Tiada skip link'));
  const blankTargets = $('a[target="_blank"]').toArray().filter((element) => {
    const rel = ($(element).attr('rel') || '').toLowerCase();
    return !rel.includes('noopener') && !rel.includes('noreferrer');
  });
  if (blankTargets.length) issues.push(issue('blank_target', 'warn', `${blankTargets.length} pautan target=_blank tanpa noopener`));

  return {
    path: pageConfig.path,
    label: pageConfig.label,
    kategori: pageConfig.kategori,
    url,
    status: response.status,
    ok: response.ok,
    ms,
    bytes,
    title,
    description,
    lang,
    robots,
    noindex,
    h1,
    viewport,
    skip_link: skipLink,
    images: imageElements.length,
    missing_alt: missingAlt,
    empty_alt: emptyAlt,
    internal_links: links.filter((link) => link.kind === 'internal').length,
    external_links: links.filter((link) => link.kind === 'external').length,
    canonical,
    og_title: ogTitle,
    og_description: ogDescription,
    links,
    issues,
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  const count = Math.min(Math.max(1, limit), items.length);
  const runners = Array.from({ length: count }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) break;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
}

function collectLinks(pages) {
  const internal = new Map();
  const external = new Map();
  for (const page of pages) {
    for (const link of page.links || []) {
      const map = link.kind === 'internal' ? internal : external;
      const key = link.url.split('#')[0];
      if (!map.has(key)) {
        map.set(key, { url: key, type: link.kind, sources: new Set() });
      }
      map.get(key).sources.add(page.path || 'index.html');
    }
  }
  return {
    internal: [...internal.values()].slice(0, config.audit?.max_internal_links || 80),
    external: [...external.values()].slice(0, config.audit?.max_external_links || 60),
  };
}

async function checkLink(link) {
  const started = performance.now();
  let response;
  let method = 'HEAD';
  let error = null;
  const timeout = Math.min(config.audit?.timeout_ms || 15000, 10000);
  try {
    response = await fetchWithTimeout(link.url, { method: 'HEAD' }, timeout);
    if ([403, 405, 501].includes(response.status)) {
      method = 'GET';
      response = await fetchWithTimeout(link.url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
      }, timeout);
    }
  } catch (caught) {
    error = caught.message;
  }
  const ms = Math.round(performance.now() - started);
  const status = response?.status || 0;
  const ok = status >= 200 && status < 400;
  const soft = [401, 403, 405, 429].includes(status);
  const knownWarn = WARN_DOMAINS.some((domain) => link.url.includes(domain));
  let level = 'pass';
  if (!ok && (soft || knownWarn)) level = 'warn';
  else if (!ok) level = 'fail';
  return {
    ...link,
    sources: [...link.sources],
    status,
    ok,
    level,
    ms,
    method,
    error,
  };
}

function linkCheck(id, label, links, category) {
  const fails = links.filter((link) => link.level === 'fail');
  const warns = links.filter((link) => link.level === 'warn');
  const status = fails.length ? 'fail' : warns.length ? 'warn' : links.length ? 'pass' : 'unknown';
  return makeCheck(
    id,
    label,
    status,
    category,
    `${links.length} pautan disemak · ${fails.length} gagal · ${warns.length} amaran`,
    [...fails, ...warns].slice(0, 100),
  );
}

async function checkR2() {
  const booksPath = path.join(DB_DIR, 'books.json');
  const data = await readJson(booksPath);
  if (!data) {
    return {
      books: [],
      checks: [makeCheck('r2.pdf', 'PDF R2', 'unknown', 'r2', 'books.json tidak ditemui')],
    };
  }
  const books = [];
  for (const group of data.kumpulan || []) {
    for (const book of group.buku || []) {
      books.push({ ...book, kumpulan: group.tajuk || group.id || '' });
    }
  }
  const results = await mapLimit(books, 4, async (book) => {
    const pdf = await checkAsset(book.pdf, 'pdf');
    const cover = await checkAsset(book.cover, 'image');
    const issues = [];
    if (pdf.level !== 'pass') issues.push({ severity: pdf.level, message: `PDF: ${pdf.error || `HTTP ${pdf.status}`}` });
    if (cover.level !== 'pass') issues.push({ severity: cover.level, message: `Cover: ${cover.error || `HTTP ${cover.status}`}` });
    return {
      ...book,
      pdf_status: pdf.status,
      pdf_ok: pdf.ok,
      pdf_level: pdf.level,
      pdf_bytes: pdf.bytes,
      pdf_type: pdf.type,
      pdf_ms: pdf.ms,
      cover_status: cover.status,
      cover_ok: cover.ok,
      cover_level: cover.level,
      cover_bytes: cover.bytes,
      cover_type: cover.type,
      cover_ms: cover.ms,
      issues,
    };
  });
  const pdfFail = results.filter((book) => book.pdf_level === 'fail');
  const pdfWarn = results.filter((book) => book.pdf_level === 'warn');
  const coverFail = results.filter((book) => book.cover_level === 'fail');
  const coverWarn = results.filter((book) => book.cover_level === 'warn');
  const pdfStatus = pdfFail.length ? 'fail' : pdfWarn.length ? 'warn' : results.length ? 'pass' : 'unknown';
  const coverStatus = coverFail.length ? 'fail' : coverWarn.length ? 'warn' : results.length ? 'pass' : 'unknown';
  return {
    books: results,
    checks: [
      makeCheck(
        'r2.pdf',
        'PDF R2',
        pdfStatus,
        'r2',
        `${results.length} PDF · ${pdfFail.length} gagal · ${pdfWarn.length} amaran`,
        [...pdfFail, ...pdfWarn].map((book) => ({ buku: book.id, tajuk: book.tajuk, status: book.pdf_status, error: book.issues.find((item) => item.message.startsWith('PDF'))?.message })),
      ),
      makeCheck(
        'r2.cover',
        'Cover R2',
        coverStatus,
        'r2',
        `${results.length} cover · ${coverFail.length} gagal · ${coverWarn.length} amaran`,
        [...coverFail, ...coverWarn].map((book) => ({ buku: book.id, tajuk: book.tajuk, status: book.cover_status, error: book.issues.find((item) => item.message.startsWith('Cover'))?.message })),
      ),
    ],
  };
}

async function checkAsset(url, kind) {
  const started = performance.now();
  let response;
  let method = 'HEAD';
  let error = null;
  try {
    response = await fetchWithTimeout(url, { method: 'HEAD' }, 15000);
    if ([403, 405, 501].includes(response.status)) {
      method = 'GET';
      response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
      }, 15000);
    }
  } catch (caught) {
    error = caught.message;
  }
  const ms = Math.round(performance.now() - started);
  const status = response?.status || 0;
  const type = response?.headers.get('content-type') || '';
  const bytes = Number(response?.headers.get('content-length') || 0) || null;
  const ok = (status === 200 || status === 206)
    && (kind === 'pdf' ? type.includes('pdf') : type.startsWith('image/'));
  const level = ok ? 'pass' : status === 0 || status >= 500 ? 'fail' : 'warn';
  return { status, ok, level, type, bytes, ms, method, error };
}

async function github(pathname) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    let response = await fetchWithTimeout(`https://api.github.com${pathname}`, { headers }, 12000);
    // Token mungkin luput, terhad kepada repo lain, atau tiada akses.
    // Repo website adalah awam, jadi cuba semula tanpa auth supaya semakan
    // deploy tidak menggagalkan seluruh audit.
    if ([401, 403, 404].includes(response.status) && token) {
      delete headers.Authorization;
      response = await fetchWithTimeout(`https://api.github.com${pathname}`, { headers }, 12000);
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      return { ok: false, status: response.status, error: data?.message || `HTTP ${response.status}`, data: null };
    }
    return { ok: true, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error.message, data: null };
  }
}

async function checkGitHub() {
  const repo = config.site.repo;
  const branch = config.site.branch || 'main';
  const [commit, runs, pages, build] = await Promise.all([
    github(`/repos/${repo}/commits/${branch}`),
    github(`/repos/${repo}/actions/runs?per_page=5&branch=${encodeURIComponent(branch)}`),
    github(`/repos/${repo}/pages`),
    github(`/repos/${repo}/pages/builds/latest`),
  ]);
  const latestRun = runs.data?.workflow_runs?.[0] || null;
  const deploy = {
    sha: commit.data?.sha ? commit.data.sha.slice(0, 7) : null,
    sha_full: commit.data?.sha || null,
    commit_date: commit.data?.commit?.committer?.date || null,
    commit_message: commit.data?.commit?.message?.split('\n')[0] || null,
    commit_author: commit.data?.commit?.author?.name || null,
    actions: latestRun ? {
      name: latestRun.name,
      status: latestRun.status,
      conclusion: latestRun.conclusion,
      url: latestRun.html_url,
      updated_at: latestRun.updated_at,
      sha: latestRun.head_sha?.slice(0, 7),
    } : null,
    runs: (runs.data?.workflow_runs || []).map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      url: run.html_url,
      updated_at: run.updated_at,
      sha: run.head_sha?.slice(0, 7),
    })),
    pages: {
      status: pages.data?.status || build.data?.status || 'unknown',
      url: pages.data?.html_url || config.site.url,
      build_type: pages.data?.build_type || null,
      error: pages.error || build.error || null,
      updated_at: build.data?.updated_at || null,
    },
    error: commit.error || pages.error || null,
    checked_at: isoNow(),
  };
  const authProblem = [401, 403].includes(commit.status) || [401, 403].includes(pages.status);
  const checks = [
    makeCheck(
      'deploy.commit',
      'Commit terakhir',
      commit.ok ? 'pass' : authProblem ? 'unknown' : 'warn',
      'deploy',
      commit.ok ? `${deploy.sha} · ${deploy.commit_message || ''}` : authProblem ? 'GitHub API tidak tersedia (token/tip rate limit)' : commit.error,
      commit.ok ? [] : [{ error: commit.error }],
    ),
    makeCheck(
      'deploy.actions',
      'GitHub Actions',
      !latestRun ? 'unknown' : latestRun.conclusion === 'success' ? 'pass' : latestRun.status === 'in_progress' || latestRun.status === 'queued' ? 'warn' : 'fail',
      'deploy',
      latestRun ? `${latestRun.status} · ${latestRun.conclusion || '—'}` : authProblem ? 'GitHub API tidak tersedia' : 'Tiada run ditemui',
      latestRun ? [{ name: latestRun.name, url: latestRun.html_url }] : [],
    ),
    makeCheck(
      'deploy.pages',
      'GitHub Pages',
      pages.ok && pages.data?.status === 'built' ? 'pass' : pages.ok ? 'warn' : authProblem || pages.status === 404 ? 'unknown' : 'warn',
      'deploy',
      pages.ok ? `Status: ${pages.data?.status || 'unknown'}` : authProblem ? 'GitHub API tidak tersedia' : pages.error || 'Pages belum aktif',
      pages.ok ? [] : [{ error: pages.error }],
    ),
  ];
  return { deploy, checks };
}

async function checkLighthouse() {
  if (!useLighthouse) {
    return {
      results: [],
      checks: [makeCheck('lighthouse.run', 'Lighthouse', 'unknown', 'prestasi', 'Dilangkau. Jalankan dengan --lighthouse.')],
    };
  }
  const items = (config.lighthouse?.halaman || ['']).map((relative) => ({
    url: absoluteUrl(relative),
    label: pageLabel(relative),
  }));
  console.log(`Lighthouse: ${items.map((item) => item.label).join(', ')}`);
  const results = await runLighthouse(items, { categories: config.lighthouse?.kategori });
  const average = (key) => {
    const values = results
      .filter((result) => result.ok && typeof result.scores?.[key] === 'number')
      .map((result) => result.scores[key]);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  const checks = [];
  const add = (id, label, key, category, note = '') => {
    const value = average(key);
    const status = value === null ? 'unknown' : value >= 90 ? 'pass' : value >= 70 ? 'warn' : 'fail';
    checks.push(makeCheck(
      id,
      label,
      status,
      category,
      value === null ? 'Tiada skor Lighthouse' : `Skor purata ${value}/100${note}`,
      results.filter((result) => !result.ok).map((result) => ({ label: result.label, error: result.error })),
    ));
  };
  add('lighthouse.performance', 'Prestasi Lighthouse', 'performance', 'prestasi');
  add('lighthouse.accessibility', 'Kebolehcapaian Lighthouse', 'accessibility', 'a11y');
  add('lighthouse.best_practices', 'Amalan terbaik Lighthouse', 'best-practices', 'prestasi');
  add('lighthouse.seo', 'SEO Lighthouse', 'seo', 'seo');

  // Semasa fasa draf, noindex memang disengajakan. Skor SEO Lighthouse
  // (terutama audit is-crawlable) tidak mencerminkan kualiti sebenar,
  // jadi jangan kira ia sebagai kegagalan.
  if (config.site.fasa === 'draf') {
    const seoCheck = checks.find((check) => check.id === 'lighthouse.seo');
    if (seoCheck) {
      seoCheck.status = 'unknown';
      seoCheck.detail = 'Tidak terpakai semasa draf (noindex disengajakan)';
      seoCheck.items = [];
    }
  }
  return { results, checks };
}

async function buildUptime(homePage) {
  const current = {
    at: isoNow(),
    status: homePage?.status || 0,
    ms: homePage?.ms || null,
    ok: Boolean(homePage?.ok),
  };
  let history = [];
  const existing = await readJson(path.join(DATA_DIR, 'uptime.json'));
  if (existing) history = Array.isArray(existing) ? existing : (existing.history || []);
  history.push(current);
  history = history.slice(-90);
  const payload = { generated_at: current.at, current, history };
  await writeJson(path.join(DATA_DIR, 'uptime.json'), payload);
  const status = current.ok ? (current.ms > (config.ambang?.masa_ms || 2500) * 2 ? 'warn' : 'pass') : 'fail';
  return {
    payload,
    check: makeCheck(
      'uptime.current',
      'Ketersediaan laman',
      status,
      'deploy',
      current.ok ? `HTTP ${current.status} · ${current.ms} ms` : 'Laman tidak dapat diakses',
      current.ok ? [] : [current],
    ),
  };
}

function scoreChecks(checks) {
  const values = checks.filter((check) => ['pass', 'warn', 'fail'].includes(check.status));
  if (!values.length) return null;
  const total = values.reduce((sum, check) => {
    if (check.status === 'pass') return sum + 100;
    if (check.status === 'warn') return sum + 65;
    return sum;
  }, 0);
  return Math.round(total / values.length);
}

function categoryScore(checks, lighthouseScores = []) {
  const values = [];
  const base = scoreChecks(checks);
  if (base !== null) values.push(base);
  for (const score of lighthouseScores) {
    if (typeof score === 'number') values.push(score);
  }
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function issuesFor(pages, codes) {
  return pages.flatMap((page) => page.issues
    .filter((item) => codes.includes(item.code))
    .map((item) => ({
      page: page.path || 'index.html',
      label: page.label,
      severity: item.severity,
      message: item.message,
    })));
}

function checkFromIssues(id, label, category, codes) {
  const items = issuesFor(pages, codes);
  const status = items.some((item) => item.severity === 'fail')
    ? 'fail'
    : items.some((item) => item.severity === 'warn')
      ? 'warn'
      : 'pass';
  return makeCheck(id, label, status, category, items.length ? `${items.length} isu` : 'Tiada isu', items.slice(0, 100));
}

async function main() {
  const startedAt = Date.now();
  config = await readJson(configPath);
  if (!config) throw new Error(`Config tidak ditemui atau rosak: ${configPath}`);
  if (!existsSync(siteRoot)) throw new Error(`Folder website tidak ditemui: ${siteRoot}`);

  console.log('PERKIM Monitor — audit');
  console.log(`Website : ${siteRoot}`);
  console.log(`Config  : ${configPath}`);
  console.log(`Fasa    : ${config.site.fasa}`);

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(DB_DIR, { recursive: true });

  console.log('1/7 Semakan statik…');
  let staticResult;
  try {
    staticResult = await runStatic();
  } catch (error) {
    console.error(`Semakan statik gagal: ${error.message}`);
    staticResult = {
      generated_at: isoNow(),
      summary: { pass: 0, warn: 0, fail: 1, unknown: 0, checks: 1, pages: 0, json_files: 0, images: 0 },
      checks: [makeCheck('static.run', 'Semakan statik', 'fail', 'teknikal', error.message)],
      pages: [],
      programs: { total: 0, sorotan: 0, draf: 0, gambar: 0, alt_missing: 0, items: [] },
      json_files: [],
      missing_assets: [],
      large_images: [],
      temp_files: [],
      sensitive: [],
      tools: {},
    };
  }

  console.log('2/7 Snapshot database…');
  const dbIndex = await copyDatabase();
  console.log(`     ${dbIndex.files.length} fail JSON disalin.`);

  console.log('3/7 Semakan live…');
  const livePages = [];
  for (const pageConfig of config.halaman) {
    const page = await checkPage(pageConfig);
    livePages.push(page);
    console.log(`     ${page.status || 'ERR'} ${pageConfig.path || '/'} (${page.ms} ms)`);
  }

  const staticByPath = new Map(staticResult.pages.map((page) => [page.path, page]));
  pages = livePages.map((page) => {
    const key = page.path === '' ? 'index.html' : page.path;
    const staticPage = staticByPath.get(key);
    return {
      ...page,
      static: staticPage ? {
        bytes: staticPage.bytes,
        h1: staticPage.h1,
        images: staticPage.images,
        missing_alt: staticPage.missing_alt,
        empty_alt: staticPage.empty_alt,
        issues: staticPage.issues,
      } : null,
      issues: [
        ...page.issues,
        ...((staticPage?.issues || []).map((item) => ({
          code: 'static',
          severity: item.severity,
          message: item.mesej,
        }))),
      ],
    };
  });

  console.log('4/7 Semakan pautan…');
  const collected = collectLinks(pages);
  const internalLinks = await mapLimit(collected.internal, config.audit?.concurrency || 6, checkLink);
  const externalLinks = await mapLimit(collected.external, config.audit?.concurrency || 6, checkLink);
  const links = [...internalLinks, ...externalLinks];

  console.log('5/7 Semakan PDF/cover R2…');
  const r2 = await checkR2();

  console.log('6/7 Semakan GitHub & Lighthouse…');
  const [githubResult, lighthouseResult] = await Promise.all([
    checkGitHub(),
    checkLighthouse(),
  ]);

  const homePage = pages.find((page) => page.path === '');
  const uptime = await buildUptime(homePage);

  const liveChecks = [
    makeCheck(
      'live.pages',
      'Halaman live',
      pages.every((page) => page.ok) ? 'pass' : 'fail',
      'deploy',
      `${pages.filter((page) => page.ok).length}/${pages.length} halaman HTTP 200`,
      pages.filter((page) => !page.ok).map((page) => ({ page: page.path || 'index.html', status: page.status })),
    ),
    checkFromIssues('live.response_time', 'Masa respons', 'prestasi', ['slow']),
    checkFromIssues('live.html_size', 'Saiz HTML', 'prestasi', ['large']),
    checkFromIssues('live.titles', 'Tajuk live', 'seo', ['title']),
    checkFromIssues('live.descriptions', 'Meta description live', 'seo', ['description']),
    checkFromIssues('live.h1', 'H1 live', 'a11y', ['h1']),
    checkFromIssues('live.lang', 'Bahasa live', 'a11y', ['lang']),
    checkFromIssues('live.viewport', 'Viewport live', 'teknikal', ['viewport']),
    checkFromIssues('live.alt', 'Alt text live', 'a11y', ['alt', 'empty_alt']),
    checkFromIssues('live.a11y', 'Skip link & pautan selamat', 'a11y', ['skip_link', 'blank_target']),
    checkFromIssues('live.seo', 'Canonical, OG & robots', 'seo', ['canonical', 'og', 'robots']),
    linkCheck('live.internal_links', 'Pautan dalaman live', internalLinks, 'pautan'),
    linkCheck('live.external_links', 'Pautan luaran live', externalLinks, 'pautan'),
  ];

  const checks = [
    ...staticResult.checks,
    ...liveChecks,
    ...r2.checks,
    ...githubResult.checks,
    ...lighthouseResult.checks,
    uptime.check,
  ];

  const lighthouseAverage = (key) => {
    const values = lighthouseResult.results
      .filter((result) => result.ok && typeof result.scores?.[key] === 'number')
      .map((result) => result.scores[key]);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };

  const categories = CATEGORY_DEFS.map((definition) => {
    const categoryChecks = checks.filter((check) => definition.checks.includes(check.id));
    const lighthouseScores = (definition.lighthouse || [])
      .map((key) => lighthouseAverage(key))
      .filter((value) => value !== null);
    return {
      id: definition.id,
      label: definition.label,
      weight: definition.weight,
      score: categoryScore(categoryChecks, lighthouseScores),
      checks: categoryChecks.map((check) => check.id),
    };
  });

  const available = categories.filter((category) => category.score !== null);
  const totalWeight = available.reduce((sum, category) => sum + category.weight, 0);
  const overall = totalWeight
    ? Math.round(available.reduce((sum, category) => sum + category.score * category.weight, 0) / totalWeight)
    : 0;

  const summary = {
    score: overall,
    pass: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
    unknown: checks.filter((check) => check.status === 'unknown').length,
    checks: checks.length,
    pages: pages.length,
    programs: staticResult.programs?.total || 0,
    books: r2.books.length,
    lighthouse: lighthouseResult.results.length,
    categories: categories.map(({ id, label, score, weight }) => ({ id, label, score, weight })),
  };

  const status = {
    generated_at: isoNow(),
    duration_ms: Date.now() - startedAt,
    site: {
      name: config.site.nama,
      short_name: config.site.nama_pendek,
      url: config.site.url,
      repo: config.site.repo,
      branch: config.site.branch,
      phase: config.site.fasa,
      r2: config.r2.base,
      sha: githubResult.deploy.sha,
    },
    summary,
    categories,
    pages,
    programs: staticResult.programs,
    books: r2.books,
    links,
    lighthouse: lighthouseResult.results,
    deploy: githubResult.deploy,
    uptime: uptime.payload,
    checks,
    meta: {
      tool: 'perkim-monitor',
      version: '1.0.0',
      static_generated_at: staticResult.generated_at,
      chrome: chromeLabel(),
      lighthouse_enabled: useLighthouse,
      site_root: siteRoot,
    },
  };

  await writeJson(outPath, status);

  const historyPath = path.join(DATA_DIR, 'history.json');
  const existingHistory = await readJson(historyPath);
  const history = Array.isArray(existingHistory) ? existingHistory : [];
  history.push({
    at: status.generated_at,
    score: summary.score,
    pass: summary.pass,
    warn: summary.warn,
    fail: summary.fail,
    categories: Object.fromEntries(categories.map((category) => [category.id, category.score])),
    lighthouse: Object.fromEntries(lighthouseResult.results.map((result) => [result.label, result.scores?.performance ?? null])),
    sha: status.site.sha,
    duration_ms: status.duration_ms,
  });
  await writeJson(historyPath, history.slice(-90));

  console.log('7/7 Selesai.');
  console.log(`Skor keseluruhan: ${summary.score}/100`);
  console.log(`Lulus ${summary.pass} · Amaran ${summary.warn} · Gagal ${summary.fail} · Tidak diketahui ${summary.unknown}`);
  console.log(`Status: ${outPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
