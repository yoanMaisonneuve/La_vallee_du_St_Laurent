/**
 * @file Profiler.js
 * @description Profiler — real-time performance monitoring panel.
 *
 * Metrics tracked each frame:
 *   - FPS  (frames per second, rolling average over a configurable window)
 *   - MS   (frame time in milliseconds)
 *   - MEM  (JS heap used, if performance.memory is available — Chrome only)
 *   - DRAW (WebGL draw calls per frame, via renderer.info)
 *
 * Architecture:
 *   - Uses a circular ring buffer for frame time samples
 *   - Writes directly to four DOM spans (IDs: stat-fps, stat-ms, stat-mem, stat-draw)
 *   - No external dependencies — pure vanilla JS
 *   - Optional mini graph canvas drawn inside the profiler panel
 */

// ─── Profiler ────────────────────────────────────────────────────────────────

/**
 * @class Profiler
 * @description Lightweight FPS / frame-time / memory stats panel.
 *
 * Usage:
 *   const profiler = new Profiler({ sampleWindow: 60 });
 *   profiler.init(renderer);
 *   // In render loop, call BEFORE rendering:
 *   profiler.begin();
 *   // After rendering:
 *   profiler.end();
 */
export default class Profiler {

  /**
   * @param {object} [opts]
   * @param {number} [opts.sampleWindow=60]  — number of frames in rolling average
   * @param {number} [opts.updateHz=10]      — DOM update frequency (Hz)
   * @param {boolean}[opts.graph=true]       — draw mini frame-time bar graph
   * @param {boolean}[opts.visible=true]     — initial panel visibility
   */
  constructor({
    sampleWindow = 60,
    updateHz     = 10,
    graph        = true,
    visible      = true,
  } = {}) {
    this._sampleWindow  = sampleWindow;
    this._updateInterval = 1000 / updateHz; // ms between DOM updates
    this._showGraph      = graph;

    /** Circular ring buffer of frame times (ms). @type {Float32Array} */
    this._frameTimes = new Float32Array(sampleWindow);
    this._ringHead   = 0;

    /** @type {number} performance.now() at frame start */
    this._frameStart = 0;

    /** @type {number} Accumulated ms since last DOM update */
    this._accumTime  = 0;

    /** @type {number} Frame counter (total, never reset) */
    this._frameCount = 0;

    /** @type {number} Cached FPS for read-back (smoothed). */
    this.fps = 0;

    /** @type {number} Last raw frame time in ms. */
    this.frameTimeMs = 0;

    // ── DOM references ──────────────────────────────────────────────────
    this._elFPS  = null;
    this._elMS   = null;
    this._elMEM  = null;
    this._elDRAW = null;

    /** @type {THREE.WebGLRenderer|null} */
    this._renderer = null;

    /** @type {HTMLCanvasElement|null} Mini graph canvas */
    this._graphCanvas  = null;
    this._graphCtx     = null;

    this._panelEl = document.getElementById('profiler-panel');
    this._visible = visible;
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Cache DOM element references and set up the graph canvas.
   * @param {import('three').WebGLRenderer} renderer — for draw-call stats
   * @returns {Profiler}
   */
  init(renderer) {
    this._renderer = renderer;

    this._elFPS  = document.getElementById('stat-fps');
    this._elMS   = document.getElementById('stat-ms');
    this._elMEM  = document.getElementById('stat-mem');
    this._elDRAW = document.getElementById('stat-draw');

    if (!this._elFPS) {
      console.warn('[Profiler] stat DOM elements not found. Panel will be headless.');
    }

    // ── Mini graph canvas ─────────────────────────────────────────────
    if (this._showGraph && this._panelEl) {
      this._graphCanvas        = document.createElement('canvas');
      this._graphCanvas.width  = 130;
      this._graphCanvas.height = 32;
      this._graphCanvas.style.cssText = `
        display: block;
        margin-top: 6px;
        border-radius: 3px;
        image-rendering: pixelated;
      `;
      this._panelEl.appendChild(this._graphCanvas);
      this._graphCtx = this._graphCanvas.getContext('2d');
    }

    // ── Visibility ────────────────────────────────────────────────────
    if (this._panelEl) {
      this._panelEl.style.display = this._visible ? '' : 'none';
    }

    // ── Keyboard shortcut to toggle panel ─────────────────────────────
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') this.toggle();
    });

    console.info('[Profiler] Ready. Press F2 to toggle.');
    return this;
  }

  // ── Frame lifecycle ───────────────────────────────────────────────────────

  /**
   * Call at the very START of each frame (before render calls).
   */
  begin() {
    this._frameStart = performance.now();
  }

  /**
   * Call at the very END of each frame (after all render calls).
   * Records the frame time and updates the rolling stats.
   */
  end() {
    const now = performance.now();
    this.frameTimeMs = now - this._frameStart;

    // ── Write into ring buffer ────────────────────────────────────────
    this._frameTimes[this._ringHead] = this.frameTimeMs;
    this._ringHead = (this._ringHead + 1) % this._sampleWindow;
    this._frameCount++;

    // ── Throttled DOM update ──────────────────────────────────────────
    this._accumTime += this.frameTimeMs;
    if (this._accumTime >= this._updateInterval) {
      this._accumTime = 0;
      this._updateDOM();
    }
  }

  // ── Stats computation ─────────────────────────────────────────────────────

  /**
   * Compute rolling average FPS and frame time from the ring buffer.
   * @returns {{ fps: number, avgMs: number, minMs: number, maxMs: number }}
   */
  getStats() {
    let sum = 0, min = Infinity, max = 0;
    for (let i = 0; i < this._sampleWindow; i++) {
      const t = this._frameTimes[i];
      sum += t;
      if (t > 0 && t < min) min = t;
      if (t > max) max = t;
    }
    const avgMs = sum / this._sampleWindow;
    this.fps = avgMs > 0 ? 1000 / avgMs : 0;
    return {
      fps:   this.fps,
      avgMs,
      minMs: min === Infinity ? 0 : min,
      maxMs: max,
    };
  }

  // ── DOM update ────────────────────────────────────────────────────────────

  /**
   * Write computed stats to DOM spans.
   * @private
   */
  _updateDOM() {
    if (!this._elFPS) return;

    const { fps, avgMs, maxMs } = this.getStats();
    this.fps = fps;

    // ── FPS (colour coded) ────────────────────────────────────────────
    const fpsInt = Math.round(fps);
    this._elFPS.textContent = fpsInt;
    this._elFPS.style.color = fpsInt >= 55 ? '#c8ffc8'
                            : fpsInt >= 30 ? '#ffe08a'
                            :                '#ff6b6b';

    // ── Frame time ────────────────────────────────────────────────────
    this._elMS.textContent = avgMs.toFixed(1) + ' ms';

    // ── Memory (Chrome-only: window.performance.memory) ───────────────
    const mem = (performance.memory?.usedJSHeapSize ?? 0) / 1048576; // bytes → MB
    this._elMEM.textContent = mem > 0 ? mem.toFixed(1) + ' MB' : 'N/A';

    // ── Draw calls ────────────────────────────────────────────────────
    const info = this._renderer?.info?.render;
    this._elDRAW.textContent = info
      ? `${info.calls} calls / ${(info.triangles / 1000).toFixed(0)}k tris`
      : '—';

    // Reset Three.js info counters for the next frame
    if (this._renderer?.info) {
      this._renderer.info.reset();
    }

    // ── Graph ─────────────────────────────────────────────────────────
    if (this._showGraph && this._graphCtx) {
      this._drawGraph(maxMs);
    }
  }

  // ── Mini graph ────────────────────────────────────────────────────────────

  /**
   * Draw a bar chart of the ring buffer frame times onto the mini canvas.
   * @param {number} maxMs — current window max, used for y-axis scaling
   * @private
   */
  _drawGraph(maxMs) {
    const ctx = this._graphCtx;
    const w   = this._graphCanvas.width;
    const h   = this._graphCanvas.height;
    const n   = this._sampleWindow;
    const barW = w / n;
    const scale = maxMs > 0 ? (h * 0.9) / Math.max(maxMs, 16.67) : 1;
    // 16.67 ms = 60 fps budget reference

    ctx.clearRect(0, 0, w, h);

    // 60 fps budget line
    const budgetY = h - 16.67 * scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, budgetY);
    ctx.lineTo(w, budgetY);
    ctx.stroke();

    // Bars
    for (let i = 0; i < n; i++) {
      const idx  = (this._ringHead + i) % n;
      const t    = this._frameTimes[idx];
      const barH = Math.max(t * scale, 1);
      const x    = i * barW;
      const y    = h - barH;

      ctx.fillStyle = t > 33 ? '#ff6b6b'
                    : t > 16.67 ? '#ffe08a'
                    :             '#5b8dee';
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(barW) - 1, Math.ceil(barH));
    }
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  /** Show the profiler panel. */
  show() {
    this._visible = true;
    if (this._panelEl) this._panelEl.style.display = '';
  }

  /** Hide the profiler panel. */
  hide() {
    this._visible = false;
    if (this._panelEl) this._panelEl.style.display = 'none';
  }

  /** Toggle visibility. */
  toggle() {
    this._visible ? this.hide() : this.show();
  }

  // ── Disposal ──────────────────────────────────────────────────────────────

  dispose() {
    this._graphCanvas?.remove();
    this._renderer = null;
    console.info('[Profiler] Disposed.');
  }
}
