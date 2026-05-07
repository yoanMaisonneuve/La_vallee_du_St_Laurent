/**
 * @file InputManager.js
 * @description InputManager — raycasting-based interaction layer.
 *
 * Features:
 *   - Pointer tracking (mouse + touch unified via PointerEvents API)
 *   - Per-frame raycasting with throttle (configurable Hz) for performance
 *   - Hover state tracking: emits 'hover-enter' / 'hover-exit' events
 *   - Click detection with movement threshold (distinguishes click from drag)
 *   - Drag detection: 'drag-start', 'drag-move', 'drag-end' events
 *   - Selectable objects registered via addInteractive() / removeInteractive()
 *   - Clean event-listener management to avoid memory leaks
 *
 * Architecture:
 *   InputManager is renderer/scene agnostic — it receives a camera and a
 *   DOM element and fires named events. Listeners are registered with on().
 */

import * as THREE from 'three';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum pointer movement (px) to be classified as a drag, not a click. */
const DRAG_THRESHOLD_PX = 4;

/** Maximum raycast frequency in Hz (limits expensive raycaster.intersectObjects calls). */
const RAYCAST_HZ = 60;

// ─── InputManager ────────────────────────────────────────────────────────────

/**
 * @class InputManager
 * @description Manages pointer input and 3D raycasting interaction.
 *
 * Usage:
 *   const im = new InputManager();
 *   im.init(camera, renderer.domElement);
 *   im.addInteractive(mesh);
 *   im.on('click',       ({ object, point, event }) => select(object));
 *   im.on('hover-enter', ({ object })               => highlight(object));
 *   im.on('hover-exit',  ({ object })               => unhighlight(object));
 *   // In render loop:
 *   im.update();
 */
export default class InputManager {

  /**
   * @param {object}  [opts]
   * @param {number}  [opts.raycastHz=60]       — max raycast frequency
   * @param {number}  [opts.dragThreshold=4]    — pixels before drag is active
   * @param {boolean} [opts.recursive=true]     — intersect descendants of interactives
   */
  constructor({
    raycastHz    = RAYCAST_HZ,
    dragThreshold = DRAG_THRESHOLD_PX,
    recursive    = true,
  } = {}) {
    this._raycastHz     = raycastHz;
    this._dragThreshold = dragThreshold;
    this._recursive     = recursive;

    /** @type {THREE.Raycaster} */
    this._raycaster = new THREE.Raycaster();
    // Increase line/point precision for non-mesh objects
    this._raycaster.params.Line.threshold = 0.05;
    this._raycaster.params.Points.threshold = 0.1;

    /** Normalised device coordinates. @type {THREE.Vector2} */
    this._ndc = new THREE.Vector2();

    /** @type {THREE.PerspectiveCamera|null} */
    this._camera = null;

    /** @type {HTMLElement|null} */
    this._dom = null;

    /** Objects that participate in raycasting. @type {THREE.Object3D[]} */
    this._interactives = [];

    /** Currently hovered object. @type {THREE.Object3D|null} */
    this._hoveredObject = null;

    // ── Pointer state ──────────────────────────────────────────────────
    this._pointerDown   = false;
    this._pointerMoved  = false;
    this._dragActive    = false;
    this._downPos       = new THREE.Vector2(); // screen px at pointerdown
    this._currentPos    = new THREE.Vector2(); // latest screen px

    // ── Throttle ───────────────────────────────────────────────────────
    this._raycastInterval = 1000 / this._raycastHz; // ms
    this._lastRaycastTime = 0;
    this._dirtyNDC        = false; // true if NDC updated since last raycast

    // ── Bound listeners (stored for removeEventListener cleanup) ──────
    this._onPointerMove  = this._handlePointerMove.bind(this);
    this._onPointerDown  = this._handlePointerDown.bind(this);
    this._onPointerUp    = this._handlePointerUp.bind(this);
    this._onPointerLeave = this._handlePointerLeave.bind(this);
    this._onContextMenu  = (e) => e.preventDefault();

    /** Event listeners map. @type {Map<string, Function[]>} */
    this._listeners = new Map([
      'hover-enter', 'hover-exit', 'click', 'miss',
      'drag-start', 'drag-move', 'drag-end',
    ].map(k => [k, []]));
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Attach DOM listeners and store camera reference.
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement}             domElement
   * @returns {InputManager}
   */
  init(camera, domElement) {
    this._camera = camera;
    this._dom    = domElement;

    domElement.addEventListener('pointermove',  this._onPointerMove,  { passive: true });
    domElement.addEventListener('pointerdown',  this._onPointerDown);
    domElement.addEventListener('pointerup',    this._onPointerUp);
    domElement.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
    domElement.addEventListener('contextmenu',  this._onContextMenu);

    console.info('[InputManager] Ready.');
    return this;
  }

  // ── Interactive registry ──────────────────────────────────────────────────

  /**
   * Register an object (and optionally its children) for raycasting.
   * @param {THREE.Object3D} object
   */
  addInteractive(object) {
    if (!this._interactives.includes(object)) {
      this._interactives.push(object);
    }
  }

  /**
   * Remove an object from the interactive set.
   * @param {THREE.Object3D} object
   */
  removeInteractive(object) {
    const idx = this._interactives.indexOf(object);
    if (idx !== -1) this._interactives.splice(idx, 1);
    // Clear hover if the removed object was hovered
    if (this._hoveredObject === object || object.getObjectById?.(this._hoveredObject?.id)) {
      this._clearHover();
    }
  }

  /** Clear all registered interactives. */
  clearInteractives() {
    this._interactives.length = 0;
    this._clearHover();
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  /**
   * Must be called once per frame from the animation loop.
   * Throttles raycast updates to _raycastHz.
   * @param {DOMHighResTimeStamp} [now] — performance.now(), injected by main loop
   */
  update(now = performance.now()) {
    if (!this._dirtyNDC) return;
    if (now - this._lastRaycastTime < this._raycastInterval) return;

    this._lastRaycastTime = now;
    this._dirtyNDC = false;
    this._performRaycast();

    // Emit drag-move if drag is active
    if (this._dragActive) {
      this._emit('drag-move', {
        ndc:    this._ndc.clone(),
        delta:  new THREE.Vector2(
          this._currentPos.x - this._downPos.x,
          this._currentPos.y - this._downPos.y
        ),
      });
    }
  }

  // ── Raycast logic ─────────────────────────────────────────────────────────

  /**
   * Cast a ray and update hover state.
   * @private
   */
  _performRaycast() {
    if (!this._camera || this._interactives.length === 0) return;

    this._raycaster.setFromCamera(this._ndc, this._camera);
    const hits = this._raycaster.intersectObjects(this._interactives, this._recursive);

    const topHit    = hits.length > 0 ? hits[0] : null;
    const topObject = topHit?.object ?? null;

    // ── Hover state machine ────────────────────────────────────────────
    if (topObject !== this._hoveredObject) {
      if (this._hoveredObject) {
        this._emit('hover-exit', { object: this._hoveredObject });
      }
      this._hoveredObject = topObject;
      if (topObject) {
        this._emit('hover-enter', {
          object: topObject,
          point:  topHit.point.clone(),
          normal: topHit.face?.normal.clone() ?? null,
          uv:     topHit.uv?.clone() ?? null,
        });
      }
    }
  }

  // ── Pointer event handlers ────────────────────────────────────────────────

  /**
   * @param {PointerEvent} e
   * @private
   */
  _handlePointerMove(e) {
    this._updateNDC(e);
    this._currentPos.set(e.clientX, e.clientY);

    if (this._pointerDown) {
      const dx = e.clientX - this._downPos.x;
      const dy = e.clientY - this._downPos.y;
      const moved = Math.sqrt(dx * dx + dy * dy);

      if (!this._dragActive && moved > this._dragThreshold) {
        this._dragActive = true;
        this._emit('drag-start', {
          startPos: this._downPos.clone(),
          ndc:      this._ndc.clone(),
        });
      }
    }
  }

  /**
   * @param {PointerEvent} e
   * @private
   */
  _handlePointerDown(e) {
    if (e.button !== 0) return; // left button only
    this._pointerDown = true;
    this._pointerMoved = false;
    this._dragActive   = false;
    this._downPos.set(e.clientX, e.clientY);
    this._updateNDC(e);
    // Capture pointer so we receive pointerup even if cursor leaves the element
    this._dom.setPointerCapture(e.pointerId);
  }

  /**
   * @param {PointerEvent} e
   * @private
   */
  _handlePointerUp(e) {
    if (e.button !== 0) return;
    this._dom.releasePointerCapture?.(e.pointerId);

    if (this._dragActive) {
      this._emit('drag-end', {
        endPos: new THREE.Vector2(e.clientX, e.clientY),
        ndc:    this._ndc.clone(),
      });
      this._dragActive = false;
    } else {
      // It's a click — fire against the current hover object
      if (this._hoveredObject) {
        this._raycaster.setFromCamera(this._ndc, this._camera);
        const hits = this._raycaster.intersectObject(this._hoveredObject, true);
        if (hits.length > 0) {
          this._emit('click', {
            object: hits[0].object,
            point:  hits[0].point.clone(),
            face:   hits[0].face,
            event:  e,
          });
        }
      } else {
        this._emit('miss', { event: e });
      }
    }

    this._pointerDown = false;
  }

  /**
   * @param {PointerEvent} e
   * @private
   */
  _handlePointerLeave(e) {
    this._clearHover();
    this._pointerDown  = false;
    this._dragActive   = false;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Convert a PointerEvent to NDC coordinates.
   * @param {PointerEvent} e
   * @private
   */
  _updateNDC(e) {
    const rect = this._dom.getBoundingClientRect();
    this._ndc.set(
       ((e.clientX - rect.left) / rect.width ) * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1
    );
    this._dirtyNDC = true;
  }

  /**
   * Clear hover state and emit hover-exit if needed.
   * @private
   */
  _clearHover() {
    if (this._hoveredObject) {
      this._emit('hover-exit', { object: this._hoveredObject });
      this._hoveredObject = null;
    }
  }

  // ── Event bus ─────────────────────────────────────────────────────────────

  /**
   * Register a listener for an input event.
   * @param {'hover-enter'|'hover-exit'|'click'|'miss'|'drag-start'|'drag-move'|'drag-end'} event
   * @param {Function} fn
   * @returns {InputManager}
   */
  on(event, fn) {
    this._listeners.get(event)?.push(fn);
    return this;
  }

  /**
   * Remove a listener.
   * @param {string}   event
   * @param {Function} fn
   */
  off(event, fn) {
    const list = this._listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  }

  /**
   * @param {string} event
   * @param {object} data
   * @private
   */
  _emit(event, data) {
    this._listeners.get(event)?.forEach(fn => fn(data));
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** @returns {THREE.Object3D|null} Currently hovered object */
  get hoveredObject() { return this._hoveredObject; }

  /** @returns {boolean} True while a drag is in progress */
  get isDragging() { return this._dragActive; }

  /** @returns {THREE.Vector2} Current normalised device coordinates */
  get ndc() { return this._ndc.clone(); }

  // ── Disposal ──────────────────────────────────────────────────────────────

  /**
   * Remove all DOM listeners and clear state.
   */
  dispose() {
    if (!this._dom) return;
    this._dom.removeEventListener('pointermove',  this._onPointerMove);
    this._dom.removeEventListener('pointerdown',  this._onPointerDown);
    this._dom.removeEventListener('pointerup',    this._onPointerUp);
    this._dom.removeEventListener('pointerleave', this._onPointerLeave);
    this._dom.removeEventListener('contextmenu',  this._onContextMenu);
    this._interactives.length = 0;
    this._hoveredObject = null;
    this._dom = null;
    console.info('[InputManager] Disposed.');
  }
}
