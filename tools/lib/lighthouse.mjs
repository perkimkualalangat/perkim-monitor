/**
 * lighthouse.mjs — jalankan Lighthouse untuk halaman terpilih.
 *
 * Chrome/Edge dikesan secara automatik pada Windows, Linux dan macOS.
 * Jika Chrome tidak ditemui, audit lain tetap berjalan dan Lighthouse
 * akan dilaporkan sebagai tidak diketahui.
 */
import fs from 'node:fs';
import path from 'node:path';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);

export function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // abaikan calon yang tidak sah
    }
  }
  return null;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Lighthouse timeout selepas ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeItem(item) {
  if (typeof item === 'string') return { url: item, label: item };
  return { url: item.url, label: item.label || item.url };
}

export async function runLighthouse(items, options = {}) {
  const normalized = items.map(normalizeItem);
  const chromePath = findChrome();
  if (chromePath) process.env.CHROME_PATH = chromePath;

  let chrome;
  const results = [];

  try {
    chrome = await launch({
      chromeFlags: [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
      ],
      logLevel: 'error',
    });

    for (const item of normalized) {
      try {
        const runner = await withTimeout(
          lighthouse(item.url, {
            port: chrome.port,
            output: 'json',
            logLevel: 'error',
            onlyCategories: options.categories || [
              'performance',
              'accessibility',
              'best-practices',
              'seo',
            ],
            formFactor: 'mobile',
            screenEmulation: {
              mobile: true,
              width: 412,
              height: 823,
              deviceScaleFactor: 1.75,
              disabled: false,
            },
            throttling: {
              rttMs: 150,
              throughputKbps: 1638.4,
              cpuSlowdownMultiplier: 4,
              requestLatencyMs: 562.5,
              downloadThroughputKbps: 1474.56,
              uploadThroughputKbps: 675,
            },
            maxWaitForLoad: 45000,
          }),
          120000,
        );

        const lhr = runner.lhr;
        const scores = {};
        for (const [key, category] of Object.entries(lhr.categories || {})) {
          scores[key] = Math.round((category.score ?? 0) * 100);
        }
        const audit = (id) => lhr.audits?.[id]?.numericValue ?? null;
        results.push({
          url: item.url,
          label: item.label,
          ok: true,
          scores,
          metrics: {
            fcp: audit('first-contentful-paint'),
            lcp: audit('largest-contentful-paint'),
            cls: audit('cumulative-layout-shift'),
            tbt: audit('total-blocking-time'),
            si: audit('speed-index'),
          },
          warnings: lhr.runWarnings || [],
          fetch_time: lhr.fetchTime || null,
        });
      } catch (error) {
        results.push({
          url: item.url,
          label: item.label,
          ok: false,
          error: error.message,
        });
      }
    }
  } catch (error) {
    const message = chromePath
      ? `Chrome gagal dimulakan: ${error.message}`
      : `Chrome/Edge tidak ditemui. Tetapkan CHROME_PATH. (${error.message})`;
    for (const item of normalized) {
      results.push({
        url: item.url,
        label: item.label,
        ok: false,
        error: message,
      });
    }
  } finally {
    if (chrome) {
      try {
        await chrome.kill();
      } catch {
        // abaikan ralat semasa menutup Chrome
      }
    }
  }

  return results;
}

export function chromeLabel() {
  const found = findChrome();
  return found ? path.basename(found) : null;
}
