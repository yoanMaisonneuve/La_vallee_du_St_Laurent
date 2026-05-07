/**
 * @file Loader.js
 * @description AssetLoader — centralised resource loading with progress tracking,
 *   in-memory cache, and typed loaders for GLTF, HDRI, and textures.
 *
 * Features:
 *   - Single LoadingManager shared across all loaders (unified progress bar)
 *   - Promise-based API for all assets
 *   - In-memory cache (Map) to avoid duplicate network requests
 *   - Draco decoder support for compressed GLTF meshes
 *   - Morph targets and skeleton are preserved from GLTF
 *   - HDRI loading via RGBELoader → returns DataTexture for PMREMGenerator
 *   - Progress events: 'start', 'progress', 'complete', 'error'
 */

import * as THREE            from 'three';
import { GLTFLoader }        from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader }       from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader }        from 'three/addons/loaders/RGBELoader.js';
import { KTX2Loader }        from 'three/addons/loaders/KTX2Loader.js';

// ─── AssetLoader ─────────────────────────────────────────────────────────────

/**
 * @class AssetLoader
 * @description Centralised loader that manages progress, caching, and all asset types.
 *
 * Usage:
 *   const loader = new AssetLoader();
 *   loader.init(renderer);
 *   loader.on('progress', ({ loaded, total, url }) => updateBar(loaded/total));
 *   const gltf = await loader.loadGLTF('/assets/character.glb');
 *   const hdri = await loader.loadHDRI('/assets/studio.hdr');
 */
export default class AssetLoader {

  /**
   * @param {object}  [opts]
   * @param {string}  [opts.dracoDecoderPath] — URL to Draco decoder folder
   *   Defaults to the Google CDN decoder compatible with Three.js r165.
   */
  constructor({
    dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/',
  } = {}) {
    this._dracoPath = dracoDecoderPath;

    /** @type {THREE.LoadingManager} */
    this._manager = new THREE.LoadingManager();

    /** Asset cache: url → loaded asset. @type {Map<string, any>} */
    this._cache = new Map();

    /** Event listeners. @type {Map<string, Function[]>} */
    this._listeners = new Map(['start','progress','complete','error'].map(k => [k, []]));

    /** @type {GLTFLoader|null}  */
    this._gltfLoader  = null;
    /** @type {RGBELoader|null} */
    this._rgbeLoader  = null;
    /** @type {THREE.TextureLoader|null} */
    this._texLoader   = null;
    /** @type {KTX2Loader|null} */
    this._ktx2Loader  = null;

    this._setupManager();
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Build all sub-loaders. Must be called before any load() method.
   * @param {THREE.WebGLRenderer} renderer — needed for KTX2 transcoder
   * @returns {AssetLoader}
   */
  init(renderer) {
    // ── GLTF + Draco ──────────────────────────────────────────────────────
    const dracoLoader = new DRACOLoader(this._manager);
    dracoLoader.setDecoderPath(this._dracoPath);
    dracoLoader.preload(); // fetch decoder in background immediately

    this._gltfLoader = new GLTFLoader(this._manager);
    this._gltfLoader.setDRACOLoader(dracoLoader);

    // ── KTX2 / Basis compressed textures ─────────────────────────────────
    // Comment out if you don't use compressed textures
    this._ktx2Loader = new KTX2Loader(this._manager);
    this._ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/basis/');
    this._ktx2Loader.detectSupport(renderer);
    this._gltfLoader.setKTX2Loader(this._ktx2Loader);

    // ── HDRI / RGBE ───────────────────────────────────────────────────────
    this._rgbeLoader = new RGBELoader(this._manager);

    // ── Standard textures ─────────────────────────────────────────────────
    this._texLoader = new THREE.TextureLoader(this._manager);

    console.info('[AssetLoader] Loaders ready.');
    return this;
  }

  // ── LoadingManager wiring ─────────────────────────────────────────────────

  /**
   * Wire THREE.LoadingManager events to our own event bus.
   * @private
   */
  _setupManager() {
    this._manager.onStart = (url, loaded, total) => {
      this._emit('start', { url, loaded, total });
    };

    this._manager.onProgress = (url, loaded, total) => {
      this._emit('progress', {
        url,
        loaded,
        total,
        ratio: total > 0 ? loaded / total : 0,
      });
    };

    this._manager.onLoad = () => {
      this._emit('complete', {});
      console.info('[AssetLoader] All queued assets loaded.');
    };

    this._manager.onError = (url) => {
      this._emit('error', { url });
      console.error(`[AssetLoader] Failed to load: ${url}`);
    };
  }

  // ── GLTF ──────────────────────────────────────────────────────────────────

  /**
   * Load a GLTF/GLB file.
   * Returns the full GLTF result object:
   *   { scene, scenes, animations, cameras, asset }
   *
   * The root scene is already added to gltf.scene — add it to your Three.js
   * scene with sceneManager.add(gltf.scene).
   *
   * Skeleton + morph targets are preserved automatically by GLTFLoader.
   *
   * @param {string}  url
   * @param {object}  [opts]
   * @param {boolean} [opts.castShadow=true]   — configure shadow casting on all meshes
   * @param {boolean} [opts.receiveShadow=true]
   * @param {boolean} [opts.useCache=true]
   * @returns {Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>}
   */
  loadGLTF(url, { castShadow = true, receiveShadow = true, useCache = true } = {}) {
    if (useCache && this._cache.has(url)) {
      return Promise.resolve(this._cache.get(url));
    }

    return new Promise((resolve, reject) => {
      this._gltfLoader.load(
        url,
        (gltf) => {
          // ── Shadow configuration ───────────────────────────────────────
          gltf.scene.traverse(child => {
            if (child.isMesh) {
              child.castShadow    = castShadow;
              child.receiveShadow = receiveShadow;

              // Ensure frustum culling is enabled (default=true, but good to be explicit)
              child.frustumCulled = true;

              // ── Morph target influence normalisation ──────────────────
              if (child.morphTargetInfluences) {
                child.morphTargetInfluences.fill(0);
              }
            }
          });

          if (useCache) this._cache.set(url, gltf);
          resolve(gltf);
        },
        (xhr) => {
          // Per-file progress (supplement to LoadingManager)
          if (xhr.lengthComputable) {
            const pct = ((xhr.loaded / xhr.total) * 100).toFixed(0);
            console.debug(`[AssetLoader] GLTF ${pct}% — ${url}`);
          }
        },
        reject
      );
    });
  }

  // ── HDRI ──────────────────────────────────────────────────────────────────

  /**
   * Load an HDR equirectangular image.
   * Returns a THREE.DataTexture suitable for PMREMGenerator.
   *
   * @param {string}  url
   * @param {boolean} [useCache=true]
   * @returns {Promise<THREE.DataTexture>}
   */
  loadHDRI(url, useCache = true) {
    if (useCache && this._cache.has(url)) {
      return Promise.resolve(this._cache.get(url));
    }

    return new Promise((resolve, reject) => {
      this._rgbeLoader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          if (useCache) this._cache.set(url, texture);
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  // ── Textures ──────────────────────────────────────────────────────────────

  /**
   * Load a standard image texture (PNG, JPG, WebP).
   * @param {string}  url
   * @param {object}  [opts]
   * @param {THREE.ColorSpace} [opts.colorSpace=THREE.SRGBColorSpace] — use NoColorSpace for normal maps
   * @param {boolean} [opts.useCache=true]
   * @returns {Promise<THREE.Texture>}
   */
  loadTexture(url, { colorSpace = THREE.SRGBColorSpace, useCache = true } = {}) {
    if (useCache && this._cache.has(url)) {
      return Promise.resolve(this._cache.get(url));
    }

    return new Promise((resolve, reject) => {
      this._texLoader.load(
        url,
        (texture) => {
          texture.colorSpace = colorSpace;
          if (useCache) this._cache.set(url, texture);
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  // ── Batch loading ─────────────────────────────────────────────────────────

  /**
   * Load multiple assets concurrently.
   * Each item: { type: 'gltf'|'hdri'|'texture', url: string, opts?: object }
   *
   * @param {Array<{type:string, url:string, opts?:object}>} manifest
   * @returns {Promise<Map<string, any>>} — url → loaded asset
   *
   * @example
   * const assets = await loader.loadManifest([
   *   { type: 'gltf',    url: '/models/character.glb' },
   *   { type: 'hdri',    url: '/env/studio.hdr' },
   *   { type: 'texture', url: '/tex/floor.jpg', opts: { colorSpace: THREE.SRGBColorSpace } },
   * ]);
   * const gltf = assets.get('/models/character.glb');
   */
  async loadManifest(manifest) {
    const results = new Map();

    await Promise.all(manifest.map(async ({ type, url, opts = {} }) => {
      let asset;
      switch (type) {
        case 'gltf':    asset = await this.loadGLTF(url, opts);    break;
        case 'hdri':    asset = await this.loadHDRI(url, opts.useCache); break;
        case 'texture': asset = await this.loadTexture(url, opts); break;
        default:
          console.warn(`[AssetLoader] Unknown asset type "${type}" for ${url}`);
          return;
      }
      results.set(url, asset);
    }));

    return results;
  }

  // ── Event bus ─────────────────────────────────────────────────────────────

  /**
   * Register a listener for loader events.
   * @param {'start'|'progress'|'complete'|'error'} event
   * @param {Function} fn
   * @returns {AssetLoader} — for chaining
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
    if (list) {
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  /**
   * @param {string} event
   * @param {object} data
   * @private
   */
  _emit(event, data) {
    this._listeners.get(event)?.forEach(fn => fn(data));
  }

  // ── Cache management ──────────────────────────────────────────────────────

  /**
   * Evict a single entry from the cache.
   * @param {string} url
   */
  evict(url) {
    this._cache.delete(url);
  }

  /** Clear the entire asset cache. Does NOT dispose GPU resources. */
  clearCache() {
    this._cache.clear();
  }

  // ── Disposal ──────────────────────────────────────────────────────────────

  /**
   * Dispose of KTX2 and Draco worker threads + clear cache.
   * Call when the app is torn down.
   */
  dispose() {
    this._ktx2Loader?.dispose();
    this._cache.clear();
    console.info('[AssetLoader] Disposed.');
  }
}
