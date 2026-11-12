/**
 * charts.js — carta SVG ringan tanpa dependency.
 */
import { esc } from './ui.js';

function clean(values) {
  return values
    .map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : null))
    .filter((value) => value !== null);
}

export function sparkline(values, options = {}) {
  const {
    width = 640,
    height = 150,
    min = 0,
    max = 100,
    label = 'Carta garis',
    showGrid = true,
    showDots = true,
  } = options;

  const data = clean(values);
  if (!data.length) {
    return `<div class="chart-empty">Tiada data sejarah lagi.</div>`;
  }

  const padX = 10;
  const padTop = 14;
  const padBottom = 18;
  const usableW = width - padX * 2;
  const usableH = height - padTop - padBottom;
  const low = Math.min(min, ...data);
  const high = Math.max(max, ...data);
  const span = high - low || 1;

  const points = data.map((value, index) => {
    const x = data.length === 1 ? width / 2 : padX + (index / (data.length - 1)) * usableW;
    const y = padTop + (1 - (value - low) / span) * usableH;
    return { x, y, value };
  });

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${points.at(-1).x.toFixed(1)} ${height - padBottom} L${points[0].x.toFixed(1)} ${height - padBottom} Z`;

  const gridLines = showGrid
    ? [0, 0.5, 1].map((ratio) => {
      const y = padTop + ratio * usableH;
      return `<line class="chart-grid" x1="${padX}" y1="${y.toFixed(1)}" x2="${width - padX}" y2="${y.toFixed(1)}" />`;
    }).join('')
    : '';

  const dots = showDots
    ? points.map((point) => `<circle class="chart-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.6"><title>${esc(point.value)}</title></circle>`).join('')
    : '';

  const first = points[0];
  const last = points.at(-1);

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
    ${gridLines}
    <path class="chart-area" d="${area}" />
    <path class="chart-line" d="${line}" />
    ${dots}
    <text class="chart-label" x="${first.x.toFixed(1)}" y="${height - 4}" text-anchor="start">${esc(String(first.value))}</text>
    <text class="chart-label" x="${last.x.toFixed(1)}" y="${height - 4}" text-anchor="end">${esc(String(last.value))}</text>
  </svg>`;
}

export function donut(score, options = {}) {
  const {
    size = 148,
    stroke = 12,
    label = 'Skor keseluruhan',
    sublabel = 'Skor',
    light = false,
    suffix = '',
    tone = false,
  } = options;

  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return `<div class="chart-empty">Tiada skor</div>`;
  }

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const center = size / 2;
  const toneClass = tone ? (clamped >= 90 ? ' donut--pass' : clamped >= 70 ? ' donut--warn' : ' donut--fail') : '';

  return `<svg class="donut${light ? ' donut--light' : ''}${toneClass}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}: ${clamped}${esc(suffix)}">
    <circle class="donut__track" cx="${center}" cy="${center}" r="${radius}" stroke-width="${stroke}" />
    <circle class="donut__value" cx="${center}" cy="${center}" r="${radius}" stroke-width="${stroke}"
      stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 ${center} ${center})" />
    <text class="donut__text" x="${center}" y="${center + 4}" text-anchor="middle" font-size="${Math.round(size * 0.24)}">${clamped}${esc(suffix)}</text>
    <text class="donut__sub" x="${center}" y="${center + Math.round(size * 0.17)}" text-anchor="middle">${esc(sublabel)}</text>
  </svg>`;
}

export function scoreBar(score, options = {}) {
  if (typeof score !== 'number') {
    return `<div class="bar-track"><div class="bar-fill" style="width:0%"></div></div>`;
  }
  const value = Math.max(0, Math.min(100, score));
  const cls = value >= 90 ? '' : value >= 70 ? ' bar-fill--warn' : ' bar-fill--fail';
  return `<div class="bar-track" role="img" aria-label="Skor ${value} daripada 100">
    <div class="bar-fill${cls}" style="width:${value}%"></div>
  </div>`;
}

export function categoryRows(categories, options = {}) {
  const { link = false } = options;
  return `<div class="category-list">${categories.map((item) => `
    <div class="category-row">
      <span class="category-row__label">${esc(item.label)}</span>
      <div class="progress" role="img" aria-label="${esc(item.label)} ${item.score ?? 0} daripada 100">
        <div class="${scoreBarClass(item.score)}" style="width:${item.score ?? 0}%"></div>
      </div>
      <span class="category-row__value">${item.score === null ? '—' : item.score}</span>
    </div>
  `).join('')}</div>`;
}

function scoreBarClass(score) {
  if (typeof score !== 'number') return 'progress__bar';
  if (score >= 90) return 'progress__bar';
  if (score >= 70) return 'progress__bar progress__bar--warn';
  return 'progress__bar progress__bar--fail';
}
