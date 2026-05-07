/**
 * @file Renderer.js
 * @description RendererManager — owns the WebGL2 renderer, handles DPR,
 *   viewport resize, ACES tonemapping, and exposes hooks for the render loop.
 *
 * Architecture note:
 *   Every public method is documented with JSDoc.
 *   The WebGPU-ready section is kept at the bottom as commented scaffolding
 *   so it can be activated when THREE.WebGPURenderer ships in stable.
 */

import * as THREE from 'three';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum device-pixel-ratio clamped to avoid GPU overload on high-DPI screens. */
const MAX_DPR = 2.0;

/** Default ACES filmic tonemapping exposure value. */
const DEFAULT_EXPOSURE = 1.0;

// ─── RendererManager ────────────────────────────────────────────────────────

/**
 * @class RendererManager
 * @description Manages the THREE.WebGLRenderer lifecycle: creation, resize,
 *   pixel-ratio handling, tonemapping, and clean disposal.
 *
 * Usage:
 *   const rm = new RendererManager({ container: document.getElementById('canvas-container') });
 *   rm.init();
 *   rm.setSize(window.innerWidth, window.innerHeight);
 */
export default class RendererManager {

  /**
   * @param {object}      opts
   * @param {HTMLElement} opts.container   — DOM element that will receive the canvas
   * @param {boolean}     [opts.antialias=false]  — native MSAA (prefer FXAA post-process instead)
   * @param {boolean}     [opts.shadows=true]     — enable shadow maps
   * @param {number}      [opts.exposure=1.0]     — tonemapping exposure
   */
  constructor({ container, antialias = false, shadows = true, exposure = DEFAULT_EXPOSURE }) {
    /** @type {HTMLElement} */
    this.container = container;

    /** @type {THREE.WebGLRenderer|null} */
    this.renderer = null;

    /** @type {boolean} */
    this.antialias = antialias;

    /** @type {boolean} */
    this.shadows = shadows;

    /** @type {number} */
    this.exposure = exposure;

    /** @type {number} Cached DPR, updated on resize. */
    this._dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    /** @type {ResizeObserver|null} */
    this._resizeObserver = null;

    /** @type {Function[]} Listeners called after every resize. */
    this._resizeCallbacks = [];
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Creates the WebGL2 renderer, appends its canvas to the container,
   * and applies rendering settings.
   * @returns {RendererManager} — for chaining
   */
  init() {
    // ── WebGL2 context ───────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias:        this.antialias,
      powerPreference:  'high-performance',
      stencil:          false,              // disable unless needed (saves bandwidth)
      depth:            true,
      // Request WebGL2 explicitly:
      // THREE.WebGLRenderer picks it automatically when the browser supports it.
      // You can verify with: renderer.capabilities.isWebGL2
    });

    // ── Size & DPR ───────────────────────────────────────────────────────
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(width || window.innerWidth, height || window.innerHeight, false);
    this.renderer.setPixelRatio(this._dpr);

    // ── Shadow maps ──────────────────────────────────────────────────────
    if (this.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
      // VSM alternative (smoother, higher cost):
      // this.renderer.shadowMap.type = THREE.VSMShadowMap;
    }

    // ── Tonemapping (ACES filmic) ────────────────────────────────────────
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.exposure;

    // ── Color space ──────────────────────────────────────────────────────
    // Output in sRGB so the OS/monitor receives correctly gamma-corrected values.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ── Sorting ──────────────────────────────────────────────────────────
    // Transparent objects need back-to-front sorting; opaques front-to-back for early-Z.
    this.renderer.sortObjects = true;

    // ── Attach canvas ────────────────────────────────────────────────────
    this.container.appendChild(this.renderer.domElement);

    // ── Responsive resize ────────────────────────────────────────────────
    this._setupResizeObserver();

    console.info(
      `[RendererManager] WebGL${this.renderer.capabilities.isWebGL2 ? '2' : '1'} renderer ready.`,
      `DPR=${this._dpr}  Size=${this.renderer.domElement.width}×${this.renderer.domElement.height}`
    );

    return this;
  }

  // ── Resize handling ───────────────────────────────────────────────────────

  /**
   * Updates renderer size and DPR, then notifies all registered callbacks.
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {
    this._dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.renderer.setPixelRatio(this._dpr);
    this.renderer.setSize(width, height, false);
    this._resizeCallbacks.forEach(cb => cb(width, height, this._dpr));
  }

  /**
   * Register a callback invoked after every resize event.
   * Signature: (width: number, height: number, dpr: number) => void
   * @param {Function} fn
   */
  onResize(fn) {
    this._resizeCallbacks.push(fn);
  }

  /**
   * Watches the container element for size changes via ResizeObserver
   * (more accurate than window 'resize' event for embedded canvases).
   * @private
   */
  _setupResizeObserver() {
    this._resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { inlineSize: width, blockSize: height } = entry.contentBoxSize[0];
        this.setSize(width, height);
      }
    });
    this._resizeObserver.observe(this.container);
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** @returns {THREE.WebGLRenderer} */
  get instance() {
    return this.renderer;
  }

  /** Current logical canvas size (CSS pixels). */
  get size() {
    return {
      width:  this.renderer.domElement.clientWidth,
      height: this.renderer.domElement.clientHeight,
    };
  }

  /** Current physical canvas size (CSS pixels × DPR). */
  get physicalSize() {
    return {
      width:  this.renderer.domElement.width,
      height: this.renderer.domElement.height,
    };
  }

  /** @returns {number} */
  get dpr() { return this._dpr; }

  // ── Render ────────────────────────────────────────────────────────────────

  /**
   * Renders a scene + camera pair directly (bypasses EffectComposer).
   * Normally called only when post-processing is disabled.
   * @param {THREE.Scene}  scene
   * @param {THREE.Camera} camera
   */
  render(scene, camera) {
    this.renderer.render(scene, camera);
  }

  // ── Settings helpers ──────────────────────────────────────────────────────

  /**
   * Change tonemapping exposure at runtime.
   * @param {number} value
   */
  setExposure(value) {
    this.exposure = value;
    this.renderer.toneMappingExposure = value;
  }

  /**
   * Toggle shadow maps on/off at runtime (requires material needsUpdate).
   * @param {boolean} enabled
   */
  setShadows(enabled) {
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.shadowMap.needsUpdate = true;
  }

  /**
   * Returns the WebGL draw call / triangle / geometry / texture info
   * for use by the Profiler each frame.
   * @returns {THREE.WebGLInfo}
   */
  getInfo() {
    return this.renderer.info;
  }

  // ── Disposal ──────────────────────────────────────────────────────────────

  /**
   * Dispose of GPU resources and detach the canvas.
   * Call when tearing down the app (SPA route changes, HMR, etc.).
   */
  dispose() {
    this._resizeObserver?.disconnect();
    this._resizeCallbacks.length = 0;
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.renderer = null;
    console.info('[RendererManager] Disposed.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  WebGPU-ready section
//  ─────────────────────────────────────────────────────────────────────────
//  Uncomment when THREE.WebGPURenderer is stable and your target browsers
//  support the WebGPU API (navigator.gpu).
//
//  Steps to activate:
//  1. Replace import source:
//       import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';
//  2. Replace the renderer construction block in init() with:
//
//  async initWebGPU() {
//    const gpuAvailable = 'gpu' in navigator;
//
//    if (gpuAvailable) {
//      // WebGPU path
//      const WebGPURenderer = (await import('three/addons/renderers/webgpu/WebGPURenderer.js')).default;
//      this.renderer = new WebGPURenderer({ antialias: this.antialias });
//      await this.renderer.init();               // WebGPU init is async!
//      console.info('[RendererManager] WebGPU renderer active.');
//    } else {
//      // Fallback — same WebGL2 path as above
//      this.init();
//      console.warn('[RendererManager] WebGPU unavailable, falling back to WebGL2.');
//    }
//
//    // Shared post-init config (tonemapping, output colorspace, etc.) is identical.
//    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
//    this.renderer.toneMappingExposure = this.exposure;
//    this.renderer.outputColorSpace    = THREE.SRGBColorSpace;
//    this.container.appendChild(this.renderer.domElement);
//    this._setupResizeObserver();
//  }
//
//  3. In main.js, call:  await rendererManager.initWebGPU();
//     instead of:        rendererManager.init();
//
//  Note: Three.js WebGPURenderer currently supports a subset of materials.
//  MeshStandardMaterial, MeshPhysicalMaterial and custom NodeMaterials work.
//  Post-processing via EffectComposer is not yet fully supported on WebGPU —
//  use THREE.PostProcessing (new node-based pipeline) instead.
// ═══════════════════════════════════════════════════════════════════════════
