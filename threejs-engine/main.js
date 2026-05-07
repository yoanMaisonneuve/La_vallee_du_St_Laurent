/**
 * @file main.js
 * @description Application bootstrap — initialises all managers in the correct
 *   sequence, loads assets, and drives the main animation loop.
 *
 * Boot sequence:
 *   1. RendererManager.init()       — WebGL2 renderer + canvas
 *   2. SceneManager.init()          — scene graph, camera, lights
 *   3. OrbitControlsManager.init()  — camera controls
 *   4. AssetLoader.init()           — configure sub-loaders
 *   5. EffectsManager.init()        — post-processing pipeline
 *   6. InputManager.init()          — raycasting + interaction
 *   7. Profiler.init()              — FPS panel
 *   8. loadAssets()                 — GLTF model + HDRI environment
 *   9. startLoop()                  — requestAnimationFrame render loop
 *
 * Extending this engine:
 *   - Add new managers as separate ES modules following the same pattern
 *   - Register resize callbacks via rendererManager.onResize()
 *   - Add new interactive objects via inputManager.addInteractive()
 *   - Add new render passes via effectsManager.composer.addPass()
 */

import * as THREE              from 'three';
import RendererManager         from './Renderer.js';
import SceneManager            from './Scene.js';
import OrbitControlsManager    from './Controls.js';
import AssetLoader             from './Loader.js';
import EffectsManager          from './Effects.js';
import InputManager            from './InputManager.js';
import Profiler                from './Profiler.js';

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Central config object — override any value for your project.
 * In a larger engine, this would be loaded from a JSON config file.
 */
const CONFIG = {
  renderer: {
    antialias: false,   // Use FXAA post-process instead — cheaper
    shadows:   true,
    exposure:  1.0,
  },
  scene: {
    fov:  60,
    near: 0.05,
    far:  1000,
    fog:  true,
    grid: true,   // debug grid
  },
  controls: {
    dampingFactor: 0.07,
    minDistance:   0.3,
    maxDistance:   60,
  },
  effects: {
    bloom: true,
    ssao:  true,
    fxaa:  true,
    bloomParams: { threshold: 0.85, strength: 0.35, radius: 0.5 },
    ssaoParams:  { kernelRadius: 16, minDistance: 0.005, maxDistance: 0.08 },
  },
  assets: {
    // Replace these URLs with your actual assets.
    // The demo uses free CC0 assets from KhronosGroup + Poly Haven.
    gltf: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb',
    hdri: null, // e.g. 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr'
  },
  profiler: {
    sampleWindow: 60,
    updateHz:     10,
    graph:        true,
  },
};

// ─── Manager instances ────────────────────────────────────────────────────────

const rendererManager  = new RendererManager({
  container: document.getElementById('canvas-container'),
  ...CONFIG.renderer,
});

const sceneManager     = new SceneManager(CONFIG.scene);
const controlsManager  = new OrbitControlsManager(CONFIG.controls);
const assetLoader      = new AssetLoader();
const effectsManager   = new EffectsManager(CONFIG.effects);
const inputManager     = new InputManager();
const profiler         = new Profiler(CONFIG.profiler);

// ─── THREE.Clock for delta time ───────────────────────────────────────────────

/** @type {THREE.Clock} Provides delta time and elapsed time each frame. */
const clock = new THREE.Clock();

// ─── Loaded asset references ──────────────────────────────────────────────────

/** @type {import('three/addons/loaders/GLTFLoader.js').GLTF|null} */
let loadedGLTF = null;

/** @type {THREE.AnimationMixer|null} */
let mixer = null;

// ─── Loading UI helpers ───────────────────────────────────────────────────────

const loadingOverlay = document.getElementById('loading-overlay');
const loadingBar     = document.getElementById('loading-bar');
const loadingLabel   = document.getElementById('loading-label');

/**
 * Update the loading bar and label.
 * @param {number} ratio  — 0..1
 * @param {string} [label]
 */
function setLoadingProgress(ratio, label) {
  loadingBar.style.width = `${Math.round(ratio * 100)}%`;
  if (label) loadingLabel.textContent = label;
}

/** Fade out and hide the loading overlay. */
function hideLoadingOverlay() {
  loadingOverlay.classList.add('hidden');
  // Remove from DOM after CSS transition (0.6s defined in index.html)
  setTimeout(() => loadingOverlay.remove(), 700);
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Async boot function — runs the full init sequence then starts the loop.
 * Errors are caught at the top level and displayed to the user.
 */
async function boot() {
  try {
    setLoadingProgress(0, 'Initialising renderer…');

    // ── 1. Renderer ───────────────────────────────────────────────────────
    rendererManager.init();
    const renderer = rendererManager.instance;

    // ── 2. Scene + Camera ─────────────────────────────────────────────────
    setLoadingProgress(0.1, 'Building scene…');
    sceneManager.init(renderer);
    const { scene, camera } = sceneManager;

    // ── 3. Controls ───────────────────────────────────────────────────────
    setLoadingProgress(0.2, 'Setting up controls…');
    controlsManager.init(camera, renderer.domElement);

    // ── 4. Asset loader ───────────────────────────────────────────────────
    setLoadingProgress(0.25, 'Preparing loaders…');
    assetLoader.init(renderer);

    // Wire progress events to the loading bar
    assetLoader.on('progress', ({ ratio, url }) => {
      const pct = 0.25 + ratio * 0.55; // occupies 25% → 80% of the bar
      setLoadingProgress(pct, `Loading ${url.split('/').pop()}…`);
    });

    // ── 5. Effects (post-processing) ──────────────────────────────────────
    setLoadingProgress(0.3, 'Building post-processing…');
    const { width, height } = rendererManager.size;
    effectsManager.init(renderer, scene, camera, { width, height });

    // ── 6. Input manager ──────────────────────────────────────────────────
    setLoadingProgress(0.35, 'Attaching input handlers…');
    inputManager.init(camera, renderer.domElement);
    _wireInputEvents();

    // ── 7. Profiler ───────────────────────────────────────────────────────
    setLoadingProgress(0.4, 'Initialising profiler…');
    profiler.init(renderer);

    // ── 8. Load assets ────────────────────────────────────────────────────
    setLoadingProgress(0.45, 'Loading assets…');
    await loadAssets();

    // ── 9. Start loop ─────────────────────────────────────────────────────
    setLoadingProgress(1.0, 'Ready!');
    setTimeout(hideLoadingOverlay, 300);

    // Register resize callbacks across all managers
    rendererManager.onResize((w, h, dpr) => {
      sceneManager.onResize(w, h);
      effectsManager.setSize(w, h, dpr);
    });

    clock.start();
    requestAnimationFrame(renderLoop);

    console.info('[main] Boot complete ✓');

  } catch (err) {
    console.error('[main] Boot failed:', err);
    loadingLabel.textContent = `Error: ${err.message}`;
    loadingLabel.style.color = '#ff6b6b';
  }
}

// ─── Asset loading ────────────────────────────────────────────────────────────

/**
 * Load the GLTF model and optional HDRI, then configure the scene.
 * Demonstrates skeleton + morph target handling and PBR material setup.
 */
async function loadAssets() {
  const { scene } = sceneManager;
  const { gltf: gltfUrl, hdri: hdriUrl } = CONFIG.assets;

  // ── HDRI environment (optional) ────────────────────────────────────────
  if (hdriUrl) {
    try {
      const hdri = await assetLoader.loadHDRI(hdriUrl);
      sceneManager.setEnvironment(hdri, false);
    } catch (e) {
      console.warn('[main] HDRI load failed, using default lighting:', e.message);
    }
  }

  // ── GLTF model ─────────────────────────────────────────────────────────
  if (gltfUrl) {
    loadedGLTF = await assetLoader.loadGLTF(gltfUrl, {
      castShadow:    true,
      receiveShadow: false,
    });

    const model = loadedGLTF.scene;

    // ── Scale & center the model ──────────────────────────────────────
    const box    = new THREE.Box3().setFromObject(model);
    const size   = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale  = 2.0 / maxDim; // normalise to ~2 units height

    model.scale.setScalar(scale);
    model.position.sub(centre.multiplyScalar(scale));

    // ── Animation mixer ───────────────────────────────────────────────
    if (loadedGLTF.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      const clip   = loadedGLTF.animations[0];
      const action = mixer.clipAction(clip);
      action.play();

      console.info(
        `[main] Playing animation "${clip.name}" (${loadedGLTF.animations.length} total)`
      );
    }

    // ── Material enhancements ─────────────────────────────────────────
    model.traverse(child => {
      if (!child.isMesh) return;

      const mat = child.material;
      if (!mat) return;

      // Ensure PBR settings are physically sensible
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        mat.envMapIntensity = 1.0;
        mat.needsUpdate     = true;
      }

      // Log morph targets (if any)
      if (child.morphTargetInfluences?.length) {
        console.debug(
          `[main] Mesh "${child.name}" has ${child.morphTargetInfluences.length} morph targets:`,
          Object.keys(child.morphTargetDictionary ?? {})
        );
      }
    });

    // ── Add to scene ──────────────────────────────────────────────────
    sceneManager.add(model);

    // ── Register with InputManager ────────────────────────────────────
    model.traverse(child => {
      if (child.isMesh) {
        inputManager.addInteractive(child);
      }
    });

    // ── Frame camera ──────────────────────────────────────────────────
    const newBox = new THREE.Box3().setFromObject(model);
    sceneManager.frameObject(newBox, 2.0);
    // Update controls target to model centre
    const modelCentre = newBox.getCenter(new THREE.Vector3());
    controlsManager.controls.target.copy(modelCentre);

    console.info(
      `[main] GLTF loaded: ${loadedGLTF.animations.length} animations, scale=${scale.toFixed(3)}`
    );
  } else {
    // ── Demo geometry (no GLTF URL provided) ─────────────────────────
    _addDemoScene();
  }
}

/**
 * Populate a minimal demo scene when no GLTF URL is configured.
 * Useful for testing the engine standalone.
 * @private
 */
function _addDemoScene() {
  const { scene } = sceneManager;

  // Ground plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.9, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  sceneManager.add(ground, true); // static

  // Central PBR sphere (emissive for bloom demo)
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 64, 64),
    new THREE.MeshPhysicalMaterial({
      color:         0x2244aa,
      metalness:     0.9,
      roughness:     0.1,
      emissive:      0x002288,
      emissiveIntensity: 1.5,
      clearcoat:     1.0,
      clearcoatRoughness: 0.05,
    })
  );
  sphere.position.y = 0.7;
  sphere.castShadow = true;
  sceneManager.add(sphere);
  inputManager.addInteractive(sphere);

  // Torus knot
  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.4, 0.12, 128, 16),
    new THREE.MeshStandardMaterial({ color: 0xcc4422, metalness: 0.3, roughness: 0.5 })
  );
  knot.position.set(2, 0.7, 0);
  knot.castShadow = true;
  sceneManager.add(knot);
  inputManager.addInteractive(knot);

  console.info('[main] Demo scene created (no GLTF URL configured).');
}

// ─── Input event wiring ───────────────────────────────────────────────────────

/**
 * Connect InputManager events to scene interaction logic.
 * @private
 */
function _wireInputEvents() {
  // Highlight on hover
  inputManager.on('hover-enter', ({ object }) => {
    if (!object?.material) return;
    // Store original emissive intensity
    object.userData._prevEmissive = object.material.emissiveIntensity ?? 0;
    object.material.emissiveIntensity = Math.max(
      (object.userData._prevEmissive ?? 0) + 0.4, 0.5
    );
    document.body.style.cursor = 'pointer';
  });

  inputManager.on('hover-exit', ({ object }) => {
    if (!object?.material) return;
    object.material.emissiveIntensity = object.userData._prevEmissive ?? 0;
    document.body.style.cursor = '';
  });

  // Select on click
  inputManager.on('click', ({ object, point }) => {
    console.info('[main] Clicked:', object.name || object.type, 'at', point);
    // Example: focus camera on clicked object
    controlsManager.focusOn(point, 3.0);
  });

  // Deselect on miss
  inputManager.on('miss', () => {
    // no-op by default
  });
}

// ─── Render loop ──────────────────────────────────────────────────────────────

/**
 * Main animation loop — driven by requestAnimationFrame.
 * Follows the pattern: begin profiling → update → render → end profiling.
 *
 * @param {DOMHighResTimeStamp} timestamp — provided by rAF
 */
function renderLoop(timestamp) {
  // Schedule next frame immediately (top of function = no dropped frames)
  requestAnimationFrame(renderLoop);

  // ── Timing ───────────────────────────────────────────────────────────────
  const delta   = clock.getDelta();   // seconds since last frame (clamped internally)
  const elapsed = clock.getElapsedTime();

  // ── Profiler begin ───────────────────────────────────────────────────────
  profiler.begin();

  // ── Update subsystems ────────────────────────────────────────────────────

  // 1. Animation mixer (GLTF skeletal / morph animations)
  if (mixer) {
    mixer.update(delta);
  }

  // 2. Demo geometry spin (when no GLTF)
  if (!loadedGLTF) {
    _animateDemoObjects(elapsed);
  }

  // 3. Controls (applies inertia damping + transition)
  controlsManager.update(delta);

  // 4. Input (throttled raycasting)
  inputManager.update(timestamp);

  // ── Render ───────────────────────────────────────────────────────────────
  // EffectsManager.render() runs all composer passes (RenderPass → SSAO → Bloom → FXAA)
  effectsManager.render();

  // ── Profiler end ─────────────────────────────────────────────────────────
  profiler.end();
}

/**
 * Animate demo objects when running without a GLTF model.
 * @param {number} elapsed — seconds since start
 * @private
 */
function _animateDemoObjects(elapsed) {
  const { scene } = sceneManager;

  const sphere = scene.getObjectByName?.('Mesh'); // first mesh in demo
  const knot   = scene.children.find(c => c.geometry?.type === 'TorusKnotGeometry');

  if (knot) {
    knot.rotation.x = elapsed * 0.5;
    knot.rotation.y = elapsed * 0.8;
  }
}

// ─── Cleanup on page unload ───────────────────────────────────────────────────

/**
 * Properly dispose of all GPU resources when the page is navigated away.
 * Important for SPAs using client-side routing.
 */
function teardown() {
  mixer?.stopAllAction();
  inputManager.dispose();
  controlsManager.dispose();
  effectsManager.dispose();
  sceneManager.dispose();
  assetLoader.dispose();
  profiler.dispose();
  rendererManager.dispose();
  console.info('[main] Engine torn down.');
}

window.addEventListener('beforeunload', teardown);

// ─── HMR support (Vite / webpack) ────────────────────────────────────────────
// If you add this to a Vite project, uncomment:
// if (import.meta.hot) {
//   import.meta.hot.dispose(teardown);
// }

// ─── Start ────────────────────────────────────────────────────────────────────

boot();
