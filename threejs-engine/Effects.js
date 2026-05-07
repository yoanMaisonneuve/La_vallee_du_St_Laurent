/**
 * @file Effects.js
 * @description EffectsManager — owns the EffectComposer post-processing pipeline.
 *
 * Pipeline order (each pass feeds into the next):
 *   1. RenderPass       — renders scene+camera to a texture (no output to screen)
 *   2. SSAOPass         — screen-space ambient occlusion
 *   3. UnrealBloomPass  — HDR bloom (emissive + bright areas glow)
 *   4. ShaderPass FXAA  — fast approximate antialiasing (final pass)
 *
 * Each pass can be toggled at runtime via setPassEnabled().
 * Resize is handled through setSize() which must be called on window resize.
 *
 * Usage:
 *   const fx = new EffectsManager();
 *   fx.init(renderer, scene, camera, { width, height });
 *   // In render loop (replaces renderer.render):
 *   fx.render();
 */

import * as THREE               from 'three';
import { EffectComposer }       from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }           from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }      from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass }             from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass }           from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader }           from 'three/addons/shaders/FXAAShader.js';
import { OutputPass }           from 'three/addons/postprocessing/OutputPass.js';

// ─── EffectsManager ──────────────────────────────────────────────────────────

/**
 * @class EffectsManager
 */
export default class EffectsManager {

  /**
   * @param {object}  [opts]                     — global toggle defaults
   * @param {boolean} [opts.bloom=true]
   * @param {boolean} [opts.ssao=true]
   * @param {boolean} [opts.fxaa=true]
   *
   * @param {object}  [opts.bloomParams]
   * @param {number}  [opts.bloomParams.threshold=0.85]   — luminance threshold
   * @param {number}  [opts.bloomParams.strength=0.4]     — bloom intensity
   * @param {number}  [opts.bloomParams.radius=0.5]       — bloom spread
   *
   * @param {object}  [opts.ssaoParams]
   * @param {number}  [opts.ssaoParams.kernelRadius=16]   — sampling radius (pixels)
   * @param {number}  [opts.ssaoParams.minDistance=0.005]
   * @param {number}  [opts.ssaoParams.maxDistance=0.1]
   */
  constructor({
    bloom = true,
    ssao  = true,
    fxaa  = true,
    bloomParams = {},
    ssaoParams  = {},
  } = {}) {
    this._enableBloom = bloom;
    this._enableSSAO  = ssao;
    this._enableFXAA  = fxaa;

    this._bloomParams = {
      threshold: 0.85,
      strength:  0.4,
      radius:    0.5,
      ...bloomParams,
    };

    this._ssaoParams = {
      kernelRadius: 16,
      minDistance:  0.005,
      maxDistance:  0.1,
      ...ssaoParams,
    };

    /** @type {EffectComposer|null} */
    this.composer = null;

    // Named pass references for runtime control
    /** @type {RenderPass}      */ this._renderPass  = null;
    /** @type {SSAOPass}        */ this._ssaoPass     = null;
    /** @type {UnrealBloomPass} */ this._bloomPass    = null;
    /** @type {ShaderPass}      */ this._fxaaPass     = null;
    /** @type {OutputPass}      */ this._outputPass   = null;
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Build the EffectComposer and all passes.
   * @param {THREE.WebGLRenderer}      renderer
   * @param {THREE.Scene}              scene
   * @param {THREE.PerspectiveCamera}  camera
   * @param {{ width:number, height:number }} size
   * @returns {EffectsManager}
   */
  init(renderer, scene, camera, { width, height }) {
    // ── Composer ──────────────────────────────────────────────────────────
    // Use a half-float render target for HDR values (required for bloom)
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      type:          THREE.HalfFloatType,
      format:        THREE.RGBAFormat,
      colorSpace:    THREE.LinearSRGBColorSpace, // linear — output pass converts to sRGB
      samples:       0, // MSAA off (we use FXAA)
    });

    this.composer = new EffectComposer(renderer, renderTarget);
    this.composer.setSize(width, height);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // ── Pass 1: Render ────────────────────────────────────────────────────
    this._renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this._renderPass);

    // ── Pass 2: SSAO ──────────────────────────────────────────────────────
    this._ssaoPass = new SSAOPass(scene, camera, width, height);
    this._ssaoPass.kernelRadius  = this._ssaoParams.kernelRadius;
    this._ssaoPass.minDistance   = this._ssaoParams.minDistance;
    this._ssaoPass.maxDistance   = this._ssaoParams.maxDistance;
    this._ssaoPass.enabled       = this._enableSSAO;
    this.composer.addPass(this._ssaoPass);

    // ── Pass 3: Bloom ─────────────────────────────────────────────────────
    this._bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      this._bloomParams.strength,
      this._bloomParams.radius,
      this._bloomParams.threshold
    );
    this._bloomPass.enabled = this._enableBloom;
    this.composer.addPass(this._bloomPass);

    // ── Pass 4: OutputPass (tonemapping + color space conversion) ─────────
    // Must come BEFORE FXAA so FXAA operates on the final SDR image
    this._outputPass = new OutputPass();
    this.composer.addPass(this._outputPass);

    // ── Pass 5: FXAA ─────────────────────────────────────────────────────
    // FXAA needs to know the exact pixel dimensions of the render target
    this._fxaaPass = new ShaderPass(FXAAShader);
    this._fxaaPass.uniforms['resolution'].value.set(
      1 / (width  * this.composer.renderer.getPixelRatio()),
      1 / (height * this.composer.renderer.getPixelRatio())
    );
    this._fxaaPass.enabled = this._enableFXAA;
    this.composer.addPass(this._fxaaPass);

    console.info('[EffectsManager] Post-processing pipeline ready.', {
      bloom: this._enableBloom,
      ssao:  this._enableSSAO,
      fxaa:  this._enableFXAA,
    });
    return this;
  }

  // ── Per-frame render ──────────────────────────────────────────────────────

  /**
   * Execute all passes. Call once per frame instead of renderer.render().
   */
  render() {
    this.composer.render();
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  /**
   * Update all pass sizes on viewport resize.
   * @param {number} width
   * @param {number} height
   * @param {number} dpr — device-pixel-ratio
   */
  setSize(width, height, dpr = 1) {
    this.composer.setSize(width, height);
    this.composer.setPixelRatio(Math.min(dpr, 2));

    // SSAO needs explicit size update
    this._ssaoPass?.setSize(width, height);

    // FXAA resolution uniform must be updated manually
    if (this._fxaaPass) {
      this._fxaaPass.uniforms['resolution'].value.set(
        1 / (width  * Math.min(dpr, 2)),
        1 / (height * Math.min(dpr, 2))
      );
    }
  }

  // ── Runtime controls ──────────────────────────────────────────────────────

  /**
   * Enable or disable a named pass at runtime.
   * @param {'bloom'|'ssao'|'fxaa'} passName
   * @param {boolean}               enabled
   */
  setPassEnabled(passName, enabled) {
    switch (passName) {
      case 'bloom': this._bloomPass.enabled = enabled; break;
      case 'ssao':  this._ssaoPass.enabled  = enabled; break;
      case 'fxaa':  this._fxaaPass.enabled  = enabled; break;
      default:
        console.warn(`[EffectsManager] Unknown pass "${passName}"`);
    }
  }

  /**
   * Adjust bloom parameters at runtime.
   * @param {object} params
   * @param {number} [params.strength]
   * @param {number} [params.radius]
   * @param {number} [params.threshold]
   */
  setBloom({ strength, radius, threshold } = {}) {
    if (strength  !== undefined) this._bloomPass.strength        = strength;
    if (radius    !== undefined) this._bloomPass.radius          = radius;
    if (threshold !== undefined) this._bloomPass.threshold       = threshold;
  }

  /**
   * Adjust SSAO parameters at runtime.
   * @param {object} params
   * @param {number} [params.kernelRadius]
   * @param {number} [params.minDistance]
   * @param {number} [params.maxDistance]
   */
  setSSAO({ kernelRadius, minDistance, maxDistance } = {}) {
    if (kernelRadius !== undefined) this._ssaoPass.kernelRadius = kernelRadius;
    if (minDistance  !== undefined) this._ssaoPass.minDistance  = minDistance;
    if (maxDistance  !== undefined) this._ssaoPass.maxDistance  = maxDistance;
  }

  /**
   * Get a snapshot of all pass settings (useful for debug UI).
   * @returns {object}
   */
  getSettings() {
    return {
      bloom: {
        enabled:   this._bloomPass?.enabled,
        strength:  this._bloomPass?.strength,
        radius:    this._bloomPass?.radius,
        threshold: this._bloomPass?.threshold,
      },
      ssao: {
        enabled:      this._ssaoPass?.enabled,
        kernelRadius: this._ssaoPass?.kernelRadius,
        minDistance:  this._ssaoPass?.minDistance,
        maxDistance:  this._ssaoPass?.maxDistance,
      },
      fxaa: { enabled: this._fxaaPass?.enabled },
    };
  }

  // ── Disposal ──────────────────────────────────────────────────────────────

  dispose() {
    this.composer?.renderTarget1.dispose();
    this.composer?.renderTarget2.dispose();
    this.composer = null;
    console.info('[EffectsManager] Disposed.');
  }
}
