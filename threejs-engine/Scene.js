/**
 * @file Scene.js
 * @description SceneManager — owns the THREE.Scene, camera, PBR lighting rig,
 *   and HDRI environment setup.
 *
 * Responsibilities:
 *   - Create and expose the main THREE.Scene
 *   - PerspectiveCamera with sensible FOV / near / far
 *   - Full PBR lighting: ambient IBL + directional key/fill/rim
 *   - HDRI environment map (loaded via AssetLoader) for reflections & IBL
 *   - Optional equirectangular background
 *   - Scene-level optimisations: frustum culling, matrixAutoUpdate policies
 */

import * as THREE from 'three';

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  fov:       60,
  near:      0.05,
  far:       1000,
  fogColor:  0x0a0a0f,
  fogNear:   40,
  fogFar:    200,
};

// ─── SceneManager ────────────────────────────────────────────────────────────

/**
 * @class SceneManager
 * @description Owns and configures the Three.js scene graph.
 *
 * Usage:
 *   const sm = new SceneManager();
 *   sm.init(renderer.instance);
 *   sm.camera → THREE.PerspectiveCamera
 *   sm.scene  → THREE.Scene
 */
export default class SceneManager {

  /**
   * @param {object}  [opts]
   * @param {number}  [opts.fov=60]
   * @param {number}  [opts.near=0.05]
   * @param {number}  [opts.far=1000]
   * @param {boolean} [opts.fog=true]   — exponential² fog
   * @param {boolean} [opts.grid=false] — debug grid helper
   */
  constructor({
    fov  = DEFAULTS.fov,
    near = DEFAULTS.near,
    far  = DEFAULTS.far,
    fog  = true,
    grid = false,
  } = {}) {
    /** @type {THREE.Scene} */
    this.scene  = new THREE.Scene();

    /** @type {THREE.PerspectiveCamera} */
    this.camera = null;

    this._fov  = fov;
    this._near = near;
    this._far  = far;
    this._useFog  = fog;
    this._useGrid = grid;

    /** @type {THREE.DirectionalLight} Key light — main shadow caster. */
    this.keyLight  = null;

    /** @type {THREE.DirectionalLight} Fill light — soft counter illumination. */
    this.fillLight = null;

    /** @type {THREE.DirectionalLight} Rim light — edge highlight. */
    this.rimLight  = null;

    /** @type {THREE.HemisphereLight} Sky/ground ambient. */
    this.hemiLight = null;

    /** @type {THREE.PMREMGenerator|null} */
    this._pmremGenerator = null;
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Build the full scene: camera, lighting, fog, helpers.
   * @param {THREE.WebGLRenderer} renderer — needed for PMREM & initial aspect
   * @returns {SceneManager}
   */
  init(renderer) {
    const { width, height } = renderer.domElement;

    // ── Camera ───────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      this._fov,
      width / height,
      this._near,
      this._far
    );
    this.camera.position.set(0, 1.6, 5);
    this.camera.lookAt(0, 0.8, 0);
    // Name the camera so it can be retrieved from the scene by name
    this.camera.name = 'MainCamera';

    // ── Scene background ─────────────────────────────────────────────────
    this.scene.background = new THREE.Color(0x0a0a0f);

    // ── Fog ──────────────────────────────────────────────────────────────
    if (this._useFog) {
      // Exponential-squared fog: more physically correct than linear
      this.scene.fog = new THREE.FogExp2(DEFAULTS.fogColor, 0.008);
    }

    // ── PMREM Generator ──────────────────────────────────────────────────
    // Pre-integrates the environment map into a multi-resolution cube so
    // MeshStandardMaterial IBL lookups are efficient.
    this._pmremGenerator = new THREE.PMREMGenerator(renderer);
    this._pmremGenerator.compileEquirectangularShader();

    // ── Lights ───────────────────────────────────────────────────────────
    this._buildLights();

    // ── Debug helpers ────────────────────────────────────────────────────
    if (this._useGrid) {
      const grid = new THREE.GridHelper(20, 20, 0x333333, 0x222222);
      this.scene.add(grid);
    }

    // ── Performance defaults ─────────────────────────────────────────────
    // Disable auto matrix updates on the camera — we update manually.
    // This matters when you have thousands of objects; for small scenes it
    // makes negligible difference but is good practice.
    this.camera.matrixAutoUpdate = true; // keep on for camera (moves every frame)

    console.info('[SceneManager] Scene initialised.');
    return this;
  }

  // ── Lighting ──────────────────────────────────────────────────────────────

  /**
   * Builds a three-point PBR lighting rig plus hemisphere ambient.
   * All intensities are in physical units (candela) when renderer.physicallyCorrectLights = true.
   * @private
   */
  _buildLights() {
    // ── Hemisphere (sky / ground IBL approximation) ──────────────────────
    this.hemiLight = new THREE.HemisphereLight(
      0xb9d5ff,  // sky color — cool blue
      0x080820,  // ground color — dark purple
      0.6        // intensity
    );
    this.hemiLight.name = 'HemisphereLight';
    this.scene.add(this.hemiLight);

    // ── Key light (main directional, shadow caster) ──────────────────────
    this.keyLight = new THREE.DirectionalLight(0xfff5e8, 2.5);
    this.keyLight.position.set(5, 8, 5);
    this.keyLight.castShadow = true;
    this.keyLight.name = 'KeyLight';

    // Shadow camera frustum — tune to your scene scale
    const sc = this.keyLight.shadow.camera;
    sc.left = sc.bottom = -8;
    sc.right = sc.top = 8;
    sc.near = 0.1;
    sc.far  = 40;

    // Shadow map resolution — 2048² is a good balance
    this.keyLight.shadow.mapSize.setScalar(2048);

    // Reduce shadow acne with a small bias
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.normalBias = 0.02;

    this.scene.add(this.keyLight);
    // Add target explicitly so we can move it later
    this.keyLight.target.name = 'KeyLightTarget';
    this.scene.add(this.keyLight.target);

    // ── Fill light (opposite side, no shadows) ───────────────────────────
    this.fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.8);
    this.fillLight.position.set(-4, 3, -3);
    this.fillLight.name = 'FillLight';
    this.scene.add(this.fillLight);

    // ── Rim / back light (edge highlight) ────────────────────────────────
    this.rimLight = new THREE.DirectionalLight(0xffd0a0, 1.2);
    this.rimLight.position.set(0, 4, -6);
    this.rimLight.name = 'RimLight';
    this.scene.add(this.rimLight);
  }

  // ── Environment map (HDRI) ────────────────────────────────────────────────

  /**
   * Applies an equirectangular HDRI texture as the scene environment map.
   * Call after AssetLoader has loaded the HDRI (receives THREE.DataTexture).
   *
   * @param {THREE.DataTexture} hdriTexture — RGBELoader output
   * @param {boolean} [asBackground=false] — also set as scene background
   */
  setEnvironment(hdriTexture, asBackground = false) {
    const envMap = this._pmremGenerator.fromEquirectangular(hdriTexture).texture;

    this.scene.environment = envMap;
    if (asBackground) {
      this.scene.background = envMap;
    }

    // Free the source equirect texture once the PMREM is generated
    hdriTexture.dispose();
    this._pmremGenerator.dispose();
    this._pmremGenerator = null;

    console.info('[SceneManager] HDRI environment applied.');
  }

  // ── Camera helpers ────────────────────────────────────────────────────────

  /**
   * Update camera aspect ratio and projection matrix on resize.
   * @param {number} width
   * @param {number} height
   */
  onResize(width, height) {
    if (!this.camera) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Smoothly frame a bounding box in view (useful after loading a model).
   * @param {THREE.Box3} box — bounding box of the object to frame
   * @param {number}     [padding=1.5] — multiplier of the sphere radius
   */
  frameObject(box, padding = 1.5) {
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    const fovRad  = THREE.MathUtils.degToRad(this._fov * 0.5);
    const dist    = (sphere.radius * padding) / Math.tan(fovRad);
    const dir     = this.camera.position.clone().sub(sphere.center).normalize();

    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.lookAt(sphere.center);
    this.camera.near = dist * 0.01;
    this.camera.far  = dist * 10;
    this.camera.updateProjectionMatrix();
  }

  // ── Object management ─────────────────────────────────────────────────────

  /**
   * Add an object to the scene and optionally disable matrixAutoUpdate
   * if the object is known to be static (e.g. geometry that never moves).
   * @param {THREE.Object3D} object
   * @param {boolean}        [isStatic=false]
   */
  add(object, isStatic = false) {
    if (isStatic) {
      object.matrixAutoUpdate = false;
      object.updateMatrix();
    }
    this.scene.add(object);
  }

  /**
   * Remove and dispose of an object's geometry + materials.
   * @param {THREE.Object3D} object
   */
  remove(object) {
    this.scene.remove(object);
    object.traverse(child => {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material?.dispose();
      }
    });
  }

  // ── Disposal ──────────────────────────────────────────────────────────────

  /** Release all GPU resources held by the scene. */
  dispose() {
    this._pmremGenerator?.dispose();
    this.scene.environment?.dispose();
    if (this.scene.background instanceof THREE.Texture) {
      this.scene.background.dispose();
    }
    this.scene.clear();
    console.info('[SceneManager] Disposed.');
  }
}
