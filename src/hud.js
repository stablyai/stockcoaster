// DOM HUD: date/value readouts, zone label, mini chart with progress,
// headline toasts, ATH flash, ride-end summary.
import { fmtDate, fmtMoney, fmtPct } from './series.js';

const MONTHS_FULL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      symbol: document.getElementById('hud-symbol'),
      date: document.getElementById('hud-date'),
      price: document.getElementById('hud-price'),
      zone: document.getElementById('hud-zone'),
      chart: document.getElementById('hud-chart'),
      toast: document.getElementById('hud-toast'),
      ath: document.getElementById('hud-ath'),
      hint: document.getElementById('hud-hint'),
    };
    this.toastUntil = 0;
    this.athUntil = 0;
    this.toastQueue = [];
    this.cinematic = false;
    this.speedFlashUntil = 0;
    this.speedLevel = 2;
    this.chartCtx = this.el.chart.getContext('2d');

    // click the minimap to jump to that point in history
    this.onSeek = null;
    this.hoverIndex = -1;
    this.el.chart.addEventListener('click', e => {
      const i = this.indexAtEvent(e);
      if (i >= 0 && this.onSeek) this.onSeek(i);
    });
    this.el.chart.addEventListener('mousemove', e => { this.hoverIndex = this.indexAtEvent(e); });
    this.el.chart.addEventListener('mouseleave', () => { this.hoverIndex = -1; });
  }

  /** Data point index under a mouse event on the minimap, or -1. */
  indexAtEvent(e) {
    if (!this.ride || !this.chartXY) return -1;
    const r = this.el.chart.getBoundingClientRect();
    const px = (e.clientX - r.left) * (this.el.chart.width / r.width);
    const n = this.ride.points.length;
    const f = (px - 4) / (this.el.chart.width - 8);
    return Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))));
  }

  show(ride) {
    this.ride = ride;
    this.cinematic = false;
    this.el.hud.style.opacity = '1';
    this.toastQueue = [];
    this.toastUntil = 0;
    this.athUntil = 0;
    this.el.hud.classList.add('active');
    this.el.symbol.innerHTML = `${esc(ride.id)}<small>${esc(ride.name)}</small>`;
    this.el.hint.textContent = 'SPACE pause · paused: S screenshot · 1-4 speed · click map to time-travel · ESC station';
    this.speedLevel = 2;
    this.speedFlashUntil = 0;
    this.prepChart(ride);
    this.lastIndex = -1;
  }

  hide() {
    this.el.hud.classList.remove('active');
    this.el.toast.style.display = 'none';
    this.el.ath.style.display = 'none';
  }

  toggleCinematic() {
    this.cinematic = !this.cinematic;
    this.el.hud.style.opacity = this.cinematic ? '0' : '1';
  }

  flashSpeed(level) {
    this.speedLevel = level;
    this.speedFlashUntil = performance.now() + 1400;
  }

  prepChart(ride) {
    // pre-render the full scaled-value polyline to an offscreen canvas
    this.chartBase = document.createElement('canvas');
    this.chartBase.width = this.el.chart.width;
    this.chartBase.height = this.el.chart.height;
    const ctx = this.chartBase.getContext('2d');
    const W = this.chartBase.width, H = this.chartBase.height;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);
    const pts = ride.points;
    this.chartXY = i => [
      4 + (i / (pts.length - 1)) * (W - 8),
      H - 5 - ride.norm(pts[i].value) * (H - 10),
    ];
    ctx.strokeStyle = '#3b4761';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = this.chartXY(i);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  update(ride, index, zoneInfo, speed, paused = false, dt = 0) {
    if (paused) {
      // freeze toast/ATH timers while paused
      this.toastUntil += dt * 1000;
      this.athUntil += dt * 1000;
    }
    if (index !== this.lastIndex) {
      this.lastIndex = index;
      const p = ride.points[index];
      let when;
      if (p.date) {
        const [y, m, d] = p.date.split('-').map(Number);
        const day = p.timeLabel ? ` ${d}` : '';
        const time = p.timeLabel ? ` · ${esc(p.timeLabel)}` : '';
        when = `${MONTHS_FULL[m - 1]}${day} ${y}${time}`;
      } else {
        when = esc(p.label);
      }
      this.el.date.innerHTML = `${when}<small>${esc(ride.id)} RIDE</small>`;
      const first = ride.points[0].value;
      const delta = first > 0
        ? `${fmtPct(p.value / first - 1)} since start`
        : `${p.value >= first ? '+' : '−'}${esc(ride.fmtValue(Math.abs(p.value - first)))} since start`;
      this.el.price.innerHTML =
        `${esc(ride.fmtValue(p.value))}<span class="pct ${p.value >= first ? 'up' : 'down'}">${delta}</span>`;
    }
    const speedFlash = performance.now() < this.speedFlashUntil ? ` · SPEED ${this.speedLevel}` : '';
    this.el.zone.innerHTML =
      `${zoneInfo.icon} ${zoneInfo.label}${speedFlash}<span class="speed">${Math.round(speed * 2.43)} MPH</span>`;

    // chart: base + played-overlay + dot
    const ctx = this.chartCtx;
    ctx.drawImage(this.chartBase, 0, 0);
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= index; i++) {
      const [x, y] = this.chartXY(i);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    const [dx, dy] = this.chartXY(index);
    ctx.fillStyle = '#fff';
    ctx.fillRect(dx - 2.5, dy - 2.5, 5, 5);

    // hover scrubber: vertical line + date of the point you'd jump to
    if (this.hoverIndex >= 0 && this.hoverIndex < ride.points.length) {
      const W = this.el.chart.width, H = this.el.chart.height;
      const [hx] = this.chartXY(this.hoverIndex);
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, 2);
      ctx.lineTo(hx, H - 2);
      ctx.stroke();
      ctx.fillStyle = '#fcd34d';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = hx > W / 2 ? 'right' : 'left';
      ctx.fillText(ride.points[this.hoverIndex].label, hx + (hx > W / 2 ? -5 : 5), 13);
      ctx.textAlign = 'left';
    }

    if (performance.now() > this.toastUntil) {
      if (this.toastQueue.length) this.showToast(this.toastQueue.shift());
      else this.el.toast.style.display = 'none';
    }
    if (performance.now() > this.athUntil) this.el.ath.style.display = 'none';
  }

  /** Queue a headline; stacked same-moment headlines display one after another. */
  toast(headline) {
    if (performance.now() > this.toastUntil) this.showToast(headline);
    else this.toastQueue.push(headline);
  }

  showToast(headline) {
    const s = headline.sentiment === 'pos' ? '#4ade80' : headline.sentiment === 'neg' ? '#f87171' : '#d4d4d8';
    const when = headline.date ? ` ${esc(fmtDate(headline.date))}` : '';
    this.el.toast.innerHTML =
      `<span class="toast-date">📰${when}</span><br/><span style="color:${s}">${esc(headline.title)}</span>`;
    this.el.toast.style.display = 'block';
    this.toastUntil = performance.now() + (this.toastQueue.length ? 4200 : 6000);
  }

  flashATH() {
    this.el.ath.style.display = 'block';
    this.athUntil = performance.now() + 2600;
  }

  showSummary(ride) {
    const stats = ride.stats;
    const last = ride.points[ride.points.length - 1];
    const first = ride.points[0];
    const upClass = ride.up ? 'up' : 'down';
    const change = stats.totalReturn != null
      ? fmtPct(stats.totalReturn)
      : esc(`${ride.fmtValue(stats.first)} → ${ride.fmtValue(stats.last)}`);
    const rows = [
      ['RIDE', esc(`${ride.id} (${first.label} → ${last.label})`)],
      [ride.currency ? 'TOTAL RETURN' : 'TOTAL CHANGE', `<span class="${upClass}">${change}</span>`],
      ['PEAK ALTITUDE', esc(`${ride.fmtValue(stats.max)} (${ride.points[stats.maxIndex].label})`)],
      [ride.currency ? 'MAX DRAWDOWN' : 'WORST DIP', `<span class="down">-${Math.round(stats.maxDrawdown * 100)}%</span>`],
    ];
    if (ride.currency && stats.first > 0) {
      const grand = 1000 * (stats.last / stats.first);
      rows.splice(2, 0,
        ['$1,000 INVESTED', `<span class="${grand >= 1000 ? 'up' : 'down'}">${fmtMoney(grand)}</span>`]);
    }
    if (ride.hasDates) {
      const years = (new Date(last.date) - new Date(first.date)) / 31557600000;
      rows.push(years >= 1
        ? ['YEARS RIDDEN', years.toFixed(1)]
        : ['DAYS RIDDEN', Math.max(1, Math.round(years * 365.25)).toString()]);
    } else {
      rows.push(['POINTS RIDDEN', String(ride.points.length)]);
    }
    document.getElementById('summary-title').textContent = ride.up
      ? `YOU SURVIVED ${ride.id}!`
      : ride.currency ? `${ride.id} TOOK YOUR LUNCH MONEY` : `${ride.id} RODE ALL THE WAY DOWN`;
    document.getElementById('summary-rows').innerHTML =
      rows.map(([k, v]) => `<div>${k}<span>${v}</span></div>`).join('');
    document.getElementById('summary').style.display = 'flex';
  }

  hideSummary() {
    document.getElementById('summary').style.display = 'none';
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
