/**
 * @file Controls.js
 * @description OrbitControlsManager — wraps THREE.OrbitControls with
 *   configurable inertia (damping), polar/azimuth limits, and serialisable state.
 *
 * Extends the standard controls with:
 *   - Smooth damping (inertia) tuning helpers
 *   - Focus-on-target API (animate camera to frame an object)
 *   - State save/restore (useful for bookmark or undo features)
 *   - First-person mode toggle
 */

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';

// ─── OrbitControlsManager ────────────────────────────────────────────────────

/**
 * @class OrbitControlsManager
 * @description Encapsulates OrbitControls configuration, inertia, and helpers.
 *
 * Usage:
 *   const cm = new OrbitControlsManager();
 *   cm.init(camera, renderer.domElement);
 *   // In render loop:
 *   cm.update(deltaTime);
 */
export default class OrbitControlsManager {

  /**
   * @param {object}  [opts]
   * @param {number}  [opts.dampingFactor=0.08]  — higher = snappier, lower = more inertia
   * @param {number}  [opts.minDistance=0.5]
   * @param {number}  [opts.maxDistance=80]
   * @param {number}  [opts.minPolarAngle=0]     — radians from top (0 = zenith)
   * @param {number}  [opts.maxPolarAngle]        — default: just below horizontal
   * @param {boolean} [opts.enablePan=true]
   * @param {number}  [opts.panSpeed=1.0]
   * @param {number}  [opts.rotateSpeed=1.0]
   * @param {number}  [opts.zoomSpeed=1.0]
   * @param {boolean} [opts.screenSpacePanning=true]
   */
  constructor({
    dampingFactor      = 0.08,
    minDistance        = 0.5,
    maxDistance        = 80,
    minPolarAngle      = 0,
    maxPolarAngle      = Math.PI * 0.9,
    enablePan          = true,
    panSpeed           = 1.0,
    rotateSpeed        = 1.0,
    zoomSpeed          = 1.0,
    screenSpacePanning = true,
  } = {}) {
    /** @type {OrbitControls|null} */
    this.controls = null;

    this._cfg = {
      dampingFactor,
      minDistance,
      maxDistance,
      minPolarAngle,
      maxPolarAngle,
      enablePan,
      panSpeed,
      rotateSpeed,
      zoomSpeed,
      screenSpacePanning,
    };

    /** Saved state stack for undo-like camera history. */
    this._stateStack = [];

    /** Current transition target (for focusOn animation). @type {{position:THREE.Vector3, target:THREE.Vector3}|null} */
    this._transition  = null;
    this._transitionT = 0;
    this._transitionDuration = 0.6; // seconds
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Creates and configures the OrbitControls instance.
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLCanvasElement}       domElement
   * @returns {OrbitControlsManager}
   */
  init(camera, domElement) {
    this.controls = new OrbitControls(camera, domElement);
    const c = this.controls;
    const cfg = this._cfg;

    // ── Inertia ───────────────────────────────────────────────────────────
    c.enableDamping  = true;
    c.dampingFactor  = cfg.dampingFactor;

    // ── Distance limits ───────────────────────────────────────────────────
    c.minDistance    = cfg.minDistance;
    c.maxDistance    = cfg.maxDistance;

    // ── Angular limits ────────────────────────────────────────────────────
    c.minPolarAngle  = cfg.minPolarAngle;
    c.maxPolarAngle  = cfg.maxPolarAngle;
    // Azimuth limits (optional — uncomment to restrict horizontal rotation):
    // c.minAzimuthAngle = -Math.PI * 0.5;
    // c.maxAzimuthAngle =  Math.PI * 0.5;

    // ── Speed & pan ───────────────────────────────────────────────────────
    c.enablePan          = cfg.enablePan;
    c.panSpeed           = cfg.panSpeed;
    c.rotateSpeed        = cfg.rotateSpeed;
    c.zoomSpeed          = cfg.zoomSpeed;
    c.screenSpacePanning = cfg.screenSpacePanning;

    // ── Touch support ─────────────────────────────────────────────────────
    // Two-finger pinch = zoom, two-finger rotate = orbit
    c.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // ── Keyboard control (optional — arrow keys pan) ──────────────────────
    c.listenToKeyEvents(window);
    c.keyPanSpeed = 20;

    console.info('[OrbitControlsManager] Controls ready.');
    return this;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  /**
   * Must be called once per animation frame.
   * Applies damping and advances any active camera transition.
   * @param {number} deltaTime — seconds since last frame
   */
  update(deltaTime) {
    if (!this.controls) return;

    // Advance focus-on transition if active
    if (this._transition) {
      this._stepTransition(deltaTime);
    }

    // OrbitControls.update() applies inertia damping
    this.controls.update();
  }

  // ── Focus API ─────────────────────────────────────────────────────────────

  /**
   * Smoothly animate the camera to frame a target position.
   * @param {THREE.Vector3} targetPosition   — world-space point to look at
   * @param {number}        [distance=3]     — distance from target
   * @param {number}        [duration=0.6]   — transition duration in seconds
   */
  focusOn(targetPosition, distance = 3, duration = 0.6) {
    const cam     = this.controls.object;
    const dir     = cam.position.clone().sub(this.controls.target).normalize();
    const newCamPos = targetPosition.clone().addScaledVector(dir, distance);

    this._transition = {
      startCamPos:    cam.position.clone(),
      endCamPos:      newCamPos,
      startTarget:    this.controls.target.clone(),
      endTarget:      targetPosition.clone(),
    };
    this._transitionT        = 0;
    this._transitionDuration = duration;
  }

  /**
   * Advance the smooth transition by one frame.
   * Uses smoothstep easing.
   * @param {number} dt — delta time in seconds
   * @private
   */
  _stepTransition(dt) {
    this._transitionT = Math.min(this._transitionT + dt / this._transitionDuration, 1);
    const t = this._smoothstep(this._transitionT);
    const cam = this.controls.object;
    const tr  = this._transition;

    cam.position.lerpVectors(tr.startCamPos, tr.endCamPos, t);
    this.controls.target.lerpVectors(tr.startTarget, tr.endTarget, t);

    if (this._transitionT >= 1) {
      this._transition = null;
    }
  }

  /**
   * Smoothstep [0,1] → [0,1] easing function.
   * @param {number} t
   * @returns {number}
   * @private
   */
  _smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  // ── State persistence ─────────────────────────────────────────────────────

  /**
   * Push the current camera state onto the history stack.
   * @returns {object} The saved state snapshot.
   */
  saveState() {
    const state = {
      position: this.controls.object.position.clone(),
      target:   this.controls.target.clone(),
      zoom:     this.controls.object.zoom,
    };
    this._stateStack.push(state);
    return state;
  }

  /**
   * Pop and restore the most recent saved state.
   * @param {boolean} [animate=true] — use smooth transition
   */
  restoreState(animate = true) {
    const state = this._stateStack.pop();
    if (!state) return;

    if (animate) {
      this.focusOn(state.target, state.position.distanceTo(state.target));
    } else {
      this.controls.object.position.copy(state.position);
      this.controls.target.copy(state.target);
      this.controls.object.zoom = state.zoom;
      this.controls.object.updateProjectionMatrix();
    }
  }

  /**
   * Serialise current camera state as a plain object (e.g. to URL hash).
   * @returns {{ px,py,pz, tx,ty,tz, zoom }}
   */
  serialise() {
    const p = this.controls.object.position;
    const t = this.controls.target;
    return {
      px: +p.x.toFixed(3), py: +p.y.toFixed(3), pz: +p.z.toFixed(3),
      tx: +t.x.toFixed(3), ty: +t.y.toFixed(3), tz: +t.z.toFixed(3),
      zoom: +this.controls.object.zoom.toFixed(3),
    };
  }

  /**
   * Restore camera state from a plain object (e.g. from URL hash).
   * @param {{ px,py,pz, tx,ty,tz, zoom }} data
   */
  deserialise(data) {
    this.controls.object.position.set(data.px, data.py, data.pz);
    this.controls.target.set(data.tx, data.ty, data.tz);
    this.controls.object.zoom = data.zoom ?? 1;
    this.controls.object.updateProjectionMatrix();
  }

  // ── Convenience ───────────────────────────────────────────────────────────

  /** Disable all interaction (e.g. during a UI modal). */
  disable() { this.controls.enabled = false; }

  /** Re-enable interaction. */
  enable()  { this.controls.enabled = true;  }

  /**
   * Set damping factor at runtime.
   * @param {number} factor — 0.01 (very lazy) … 0.2 (snappy)
   */
  setDamping(factor) {
    this.controls.dampingFactor = factor;
  }

  // ── Disposal ──────────────────────────────────────────────────────────────

  dispose() {
    this.controls?.dispose();
    this.controls = null;
    console.info('[OrbitControlsManager] Disposed.');
  }
}
