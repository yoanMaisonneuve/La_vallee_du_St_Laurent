import * as THREE from 'three';

const heroMount = document.getElementById('hero-webgl');
const robotMount = document.getElementById('robot-webgl');
const timelineMount = document.getElementById('timeline-webgl');
const valleyMount = document.getElementById('valley-webgl');
const modeNode = document.getElementById('hero-scene-mode');

if (!heroMount || !robotMount || !timelineMount) {
  window.ISLThreeScenes = { setMode() {} };
} else {
  const pointer = { x: 0, y: 0, active: false };
  const scenes = [];
  let currentMode = modeNode?.textContent?.trim() || 'AGI';
  let currentTimelineIndex = 0;
  let currentRobotFocus = 'prototype';
  let rafId = 0;

  const paletteByMode = {
    AGI: { primary: '#6ad4ff', secondary: '#009ADE', accent: '#d6f4ff' },
    ROBOT: { primary: '#8ff0ff', secondary: '#00c2c7', accent: '#e2ffff' },
    CORRIDOR: { primary: '#84dcff', secondary: '#4d9dff', accent: '#e6f3ff' }
  };

  const getPalette = () => paletteByMode[currentMode] || paletteByMode.AGI;

  const makeRenderer = (mount) => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    return renderer;
  };

  const resizeScene = (sceneData) => {
    const rect = sceneData.mount.getBoundingClientRect();
    const width = Math.max(2, rect.width);
    const height = Math.max(2, rect.height);
    sceneData.renderer.setSize(width, height, false);
    sceneData.camera.aspect = width / height;
    sceneData.camera.updateProjectionMatrix();
  };

  const addHeroScene = () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x03111f, 4.4, 10.5);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
    camera.position.set(0, 0.1, 6.2);

    const renderer = makeRenderer(heroMount);

    const root = new THREE.Group();
    scene.add(root);

    const ambient = new THREE.AmbientLight(0x88dfff, 1.1);
    const point = new THREE.PointLight(0x4dbdff, 5.2, 18, 2);
    point.position.set(0.5, 1.2, 3.2);
    scene.add(ambient, point);

    const starCount = 1400;
    const positions = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      const radius = 1.1 + Math.random() * 1.7;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi) * 0.78;
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }

    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      color: new THREE.Color(getPalette().primary),
      size: 0.052,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    root.add(points);

    const ringA = new THREE.Mesh(
      new THREE.TorusGeometry(1.46, 0.026, 18, 180),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().primary), transparent: true, opacity: 0.42 })
    );
    ringA.rotation.x = Math.PI * 0.5;
    root.add(ringA);

    const ringB = new THREE.Mesh(
      new THREE.TorusGeometry(2.06, 0.018, 14, 180),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().secondary), transparent: true, opacity: 0.22 })
    );
    ringB.rotation.set(Math.PI * 0.24, Math.PI * 0.18, Math.PI * 0.1);
    root.add(ringB);

    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.34, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(getPalette().accent),
        transparent: true,
        opacity: 0.28,
        wireframe: true
      })
    );
    root.add(halo);

    const innerGlow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.82, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(getPalette().primary),
        transparent: true,
        opacity: 0.18,
        wireframe: true
      })
    );
    root.add(innerGlow);

    const grid = new THREE.GridHelper(9, 16, getPalette().secondary, getPalette().secondary);
    grid.position.y = -1.95;
    grid.material.transparent = true;
    grid.material.opacity = 0.16;
    root.add(grid);

    const shards = [];
    for (let index = 0; index < 8; index += 1) {
      const shard = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.12 + Math.random() * 0.18, 0),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().accent), transparent: true, opacity: 0.14, wireframe: true })
      );
      shard.position.set((Math.random() - 0.5) * 4.8, (Math.random() - 0.5) * 2.8, (Math.random() - 0.5) * 2.4);
      root.add(shard);
      shards.push(shard);
    }

    return {
      mount: heroMount,
      renderer,
      scene,
      camera,
      update(time) {
        const scroll = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 2.4);
        root.rotation.y += 0.0023;
        root.rotation.x = Math.sin(time * 0.45) * 0.08 + (pointer.active ? pointer.y * 0.18 : 0) + scroll * 0.02;
        root.position.y = Math.sin(time * 0.7) * 0.08 - scroll * 0.08;
        root.position.x += ((pointer.active ? pointer.x * 0.55 : Math.sin(time * 0.2) * 0.08) - root.position.x) * 0.06;
        points.rotation.y += 0.0015;
        points.rotation.x = Math.cos(time * 0.33) * 0.1;
        ringA.rotation.z += 0.0032;
        ringB.rotation.y -= 0.0026;
        halo.rotation.x += 0.0018;
        halo.rotation.y -= 0.0022;
        innerGlow.rotation.x -= 0.0024;
        innerGlow.rotation.z += 0.0019;
        shards.forEach((shard, index) => {
          shard.rotation.x += 0.01 + index * 0.001;
          shard.rotation.y -= 0.012 - index * 0.001;
          shard.position.y += Math.sin(time * (0.5 + index * 0.04)) * 0.0008;
        });
      },
      setMode() {
        const palette = getPalette();
        pointsMaterial.color.set(palette.primary);
        ringA.material.color.set(palette.primary);
        ringB.material.color.set(palette.secondary);
        halo.material.color.set(palette.accent);
        point.color.set(palette.secondary);
        grid.material.color?.set?.(palette.secondary);
        shards.forEach((shard, index) => {
          shard.material.color.set(index % 2 === 0 ? palette.accent : palette.primary);
        });
        innerGlow.material.color.set(palette.primary);
      }
    };
  };

  const addRobotScene = () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    camera.position.set(0, 0.1, 6.8);
    const renderer = makeRenderer(robotMount);
    renderer.domElement.style.mixBlendMode = 'screen';

    const root = new THREE.Group();
    scene.add(root);
    scene.add(new THREE.AmbientLight(0x88dfff, 0.88));
    const light = new THREE.PointLight(0x7dddff, 2.2, 20, 2);
    light.position.set(2, 2, 4);
    scene.add(light);

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.08, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().primary), transparent: true, opacity: 0.28, wireframe: true })
    );
    root.add(core);

    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.72, 0.18, 160, 18),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().secondary), wireframe: true, transparent: true, opacity: 0.44 })
    );
    knot.rotation.x = Math.PI * 0.4;
    root.add(knot);

    const spineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 1.6, 0),
      new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(0, -0.4, 0),
      new THREE.Vector3(0, -1.5, 0)
    ]);
    const spine = new THREE.Line(
      spineGeometry,
      new THREE.LineBasicMaterial({ color: new THREE.Color(getPalette().accent), transparent: true, opacity: 0.45 })
    );
    root.add(spine);

    const armMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(getPalette().primary), transparent: true, opacity: 0.34 });
    const addLimb = (points) => root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), armMaterial));
    addLimb([new THREE.Vector3(-0.1, 0.7, 0), new THREE.Vector3(-1.2, 0.35, 0.2), new THREE.Vector3(-1.65, -0.65, 0.1)]);
    addLimb([new THREE.Vector3(0.1, 0.7, 0), new THREE.Vector3(1.2, 0.35, -0.2), new THREE.Vector3(1.65, -0.65, -0.1)]);
    addLimb([new THREE.Vector3(-0.2, -0.6, 0), new THREE.Vector3(-0.7, -2, 0.1)]);
    addLimb([new THREE.Vector3(0.2, -0.6, 0), new THREE.Vector3(0.7, -2, -0.1)]);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.02, 8, 140),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().primary), transparent: true, opacity: 0.14 })
    );
    ring.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.18);
    root.add(ring);

    const focusNodes = [
      new THREE.Vector3(0, 1.2, 0),
      new THREE.Vector3(0.9, -0.05, 0),
      new THREE.Vector3(-1.2, -0.95, 0)
    ].map((position, index) => {
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(0.09 + index * 0.02, 16, 16),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().accent), transparent: true, opacity: 0.36 })
      );
      node.position.copy(position);
      root.add(node);
      return node;
    });

    return {
      mount: robotMount,
      renderer,
      scene,
      camera,
      update(time) {
        const scroll = window.scrollY * 0.0004;
        root.rotation.y = Math.sin(time * 0.55) * 0.28 + scroll;
        root.rotation.x = Math.cos(time * 0.33) * 0.08;
        knot.rotation.y += 0.01;
        knot.rotation.z += 0.006;
        core.rotation.x += 0.004;
        core.rotation.y -= 0.005;
        ring.rotation.z += 0.004;
        focusNodes.forEach((node, index) => {
          const targetScale =
            (currentRobotFocus === 'prototype' && index === 0) ||
            (currentRobotFocus === 'cadence' && index === 1) ||
            (currentRobotFocus === 'terrain' && index === 2)
              ? 1.9
              : 1;
          node.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
          node.material.opacity += (((targetScale > 1 ? 0.78 : 0.32) - node.material.opacity) * 0.08);
        });
      },
      setMode() {
        const palette = getPalette();
        core.material.color.set(palette.primary);
        knot.material.color.set(palette.secondary);
        armMaterial.color.set(palette.primary);
        spine.material.color.set(palette.accent);
        ring.material.color.set(palette.primary);
        light.color.set(palette.secondary);
        focusNodes.forEach((node, index) => {
          node.material.color.set(index === 1 ? palette.secondary : palette.accent);
        });
      }
    };
  };

  const addTimelineScene = () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
    camera.position.set(0, 0, 7.6);
    const renderer = makeRenderer(timelineMount);

    const root = new THREE.Group();
    scene.add(root);
    scene.add(new THREE.AmbientLight(0x89d8ff, 0.7));

    const loops = [];
    for (let index = 0; index < 14; index += 1) {
      const curve = new THREE.EllipseCurve(0, 0, 1.8 + index * 0.02, 0.72 + index * 0.01, 0, Math.PI * 2, false, 0);
      const points = curve.getPoints(100).map((point) => new THREE.Vector3(point.x, point.y, -index * 1.4));
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: new THREE.Color(getPalette().primary), transparent: true, opacity: Math.max(0.06, 0.22 - index * 0.01) })
      );
      root.add(line);
      loops.push(line);
    }

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 18, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().secondary), transparent: true, opacity: 0.1, wireframe: true })
    );
    beam.rotation.z = Math.PI * 0.5;
    root.add(beam);

    const markers = Array.from({ length: 4 }, (_, index) => {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.13, 0.32, 36),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().accent), transparent: true, opacity: index === 0 ? 0.88 : 0.28, side: THREE.DoubleSide })
      );
      marker.position.set(-1.8 + index * 1.2, 0, -index * 1.4);
      root.add(marker);
      return marker;
    });

    const markerGlow = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.48, 36),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().primary), transparent: true, opacity: 0.0, side: THREE.DoubleSide })
    );
    markerGlow.position.set(-1.8, 0, 0);
    root.add(markerGlow);

    return {
      mount: timelineMount,
      renderer,
      scene,
      camera,
      update(time) {
        root.rotation.z = Math.sin(time * 0.16) * 0.04;
        loops.forEach((loop, index) => {
          loop.position.z = ((time * 2.2 + index * 1.15) % 18) - 18;
          loop.rotation.z += 0.0008 * (index % 2 === 0 ? 1 : -1);
          loop.material.opacity += (((Math.abs(index - currentTimelineIndex) <= 1 ? 0.42 : 0.1) - loop.material.opacity) * 0.08);
        });
        beam.rotation.x = Math.sin(time * 0.52) * 0.16;
        markers.forEach((marker, index) => {
          marker.material.opacity += (((index === currentTimelineIndex ? 0.94 : 0.26) - marker.material.opacity) * 0.1);
          const targetScale = index === currentTimelineIndex ? 1.38 : 1;
          marker.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
        });
        const activeMarker = markers[currentTimelineIndex];
        markerGlow.position.lerp(activeMarker.position, 0.1);
        markerGlow.material.opacity += ((0.42 + Math.sin(time * 3.2) * 0.18 - markerGlow.material.opacity) * 0.1);
        markerGlow.material.color.set(getPalette().primary);
      },
      setMode() {
        const palette = getPalette();
        loops.forEach((loop, index) => {
          loop.material.color.set(index % 3 === 0 ? palette.secondary : palette.primary);
        });
        beam.material.color.set(palette.secondary);
        markers.forEach((marker, index) => {
          marker.material.color.set(index === currentTimelineIndex ? palette.accent : palette.primary);
        });
      }
    };
  };

  // ── Vallée du Saint-Laurent · rendu topographique temps réel ──
  const addValleyScene = () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020611, 0.028);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
    camera.position.set(0.0, 3.4, 5.8);
    camera.lookAt(0.2, 0.1, 0.0);

    const renderer = makeRenderer(valleyMount);
    renderer.setClearColor(0x020611, 1);

    // Projection lat/lon → plane (x east, z south) — recentrée Québec-Montréal
    const CENTER_LON = -72.2;
    const CENTER_LAT = 46.3;
    const X_SCALE = 1.05;
    const Z_SCALE = 1.15;
    const project = (lat, lon) => new THREE.Vector3(
      (lon - CENTER_LON) * X_SCALE,
      0,
      -(lat - CENTER_LAT) * Z_SCALE
    );

    // Real St-Laurent centerline (lat, lon) — simplified from NRCan hydrography
    const RIVER_COORDS = [
      [44.23, -76.48], [44.50, -75.85], [44.72, -75.52], [45.02, -74.73],
      [45.25, -74.13], [45.45, -73.90], [45.50, -73.55], [45.60, -73.43],
      [45.74, -73.45], [46.04, -73.12], [46.20, -72.90], [46.34, -72.54],
      [46.53, -72.26], [46.69, -71.90], [46.81, -71.21], [46.93, -70.85],
      [46.98, -70.55], [47.36, -70.04], [47.62, -69.95], [47.84, -69.88],
      [48.14, -69.72], [48.54, -69.22], [48.74, -69.08], [49.22, -68.14],
      [49.32, -67.60], [49.80, -67.00], [50.20, -66.38]
    ];

    // North shore sample points (Laurentides / Côte-Nord)
    const NORTH_SHORE = [
      [45.70, -76.20], [45.90, -75.60], [46.10, -75.10], [46.30, -74.50],
      [46.55, -73.90], [46.75, -73.25], [46.95, -72.65], [47.20, -72.10],
      [47.45, -71.55], [47.70, -70.95], [48.00, -70.35], [48.35, -69.80],
      [48.80, -69.20], [49.20, -68.60], [49.55, -67.95], [49.95, -67.20], [50.40, -66.60]
    ];

    // South shore sample points (Estrie / Gaspésie approach)
    const SOUTH_SHORE = [
      [44.50, -76.00], [44.80, -75.30], [45.05, -74.60], [45.20, -73.85],
      [45.28, -73.20], [45.30, -72.55], [45.40, -71.90], [45.55, -71.25],
      [45.85, -70.75], [46.15, -70.25], [46.50, -69.85], [46.85, -69.45],
      [47.25, -69.10], [47.70, -68.75], [48.10, -68.55], [48.45, -68.53],
      [48.65, -68.00], [48.85, -67.52], [48.95, -66.80], [48.80, -65.80], [48.83, -64.47]
    ];

    // Key city nodes (corridor)
    const NODES = [
      { id: 'ottawa',         lat: 45.42, lon: -75.70, label: 'OTTAWA',         size: 1.0 },
      { id: 'montreal',       lat: 45.50, lon: -73.55, label: 'MONTRÉAL',       size: 1.25 },
      { id: 'rive-nord',      lat: 45.75, lon: -73.70, label: 'RIVE-NORD',      size: 1.0 },
      { id: 'trois-rivieres', lat: 46.34, lon: -72.54, label: 'TROIS-RIVIÈRES', size: 0.9 },
      { id: 'quebec',         lat: 46.81, lon: -71.21, label: 'QUÉBEC',         size: 1.15 },
      { id: 'sherbrooke',     lat: 45.40, lon: -71.90, label: 'SHERBROOKE',     size: 0.85 }
    ];

    // Ground grid — plus visible
    const grid = new THREE.GridHelper(40, 40, 0x1a5c8a, 0x0a2e4a);
    grid.position.y = 0;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    scene.add(grid);

    // Coastline stipple — north + south shores with jitter
    const buildStipple = (corridor, count, spreadLat, spreadLon) => {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const t = Math.random() * (corridor.length - 1);
        const idx = Math.floor(t);
        const frac = t - idx;
        const [lat1, lon1] = corridor[idx];
        const [lat2, lon2] = corridor[Math.min(idx + 1, corridor.length - 1)];
        const lat = lat1 + (lat2 - lat1) * frac + (Math.random() - 0.5) * spreadLat;
        const lon = lon1 + (lon2 - lon1) * frac + (Math.random() - 0.5) * spreadLon;
        const p = project(lat, lon);
        positions[i * 3]     = p.x;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = p.z;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      return g;
    };
    const stippleMat = new THREE.PointsMaterial({
      color: 0x9ee3ff,
      size: 0.08,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    scene.add(new THREE.Points(buildStipple(NORTH_SHORE, 520, 0.9, 0.35), stippleMat));
    scene.add(new THREE.Points(buildStipple(SOUTH_SHORE, 520, 0.9, 0.35), stippleMat));

    // River centerline (tube + halo)
    const riverVecs = RIVER_COORDS.map(([lat, lon]) => {
      const p = project(lat, lon);
      p.y = 0.012;
      return p;
    });
    const riverCurve = new THREE.CatmullRomCurve3(riverVecs, false, 'catmullrom', 0.5);
    const riverCore = new THREE.Mesh(
      new THREE.TubeGeometry(riverCurve, 220, 0.022, 10, false),
      new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending })
    );
    const riverHalo = new THREE.Mesh(
      new THREE.TubeGeometry(riverCurve, 220, 0.08, 10, false),
      new THREE.MeshBasicMaterial({ color: 0x84dcff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })
    );
    const riverFarHalo = new THREE.Mesh(
      new THREE.TubeGeometry(riverCurve, 220, 0.2, 10, false),
      new THREE.MeshBasicMaterial({ color: 0x1a6ca8, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending })
    );
    scene.add(riverFarHalo, riverHalo, riverCore);

    // Flow particles along the river — shader animé
    const FLOW_COUNT = 60;
    const flowPositions = new Float32Array(FLOW_COUNT * 3);
    const flowOffsets = new Float32Array(FLOW_COUNT);
    for (let i = 0; i < FLOW_COUNT; i++) {
      flowOffsets[i] = i / FLOW_COUNT;
    }
    const flowGeom = new THREE.BufferGeometry();
    flowGeom.setAttribute('position', new THREE.BufferAttribute(flowPositions, 3));
    const flowMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.08, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    const flowPoints = new THREE.Points(flowGeom, flowMat);
    scene.add(flowPoints);

    // City nodes + vertical beams + node cluster points
    const beamVertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const beamFragmentShader = `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uPhase;
      void main() {
        float vertFade = pow(1.0 - vUv.y, 1.7);
        float horzFade = smoothstep(0.5, 0.0, abs(vUv.x - 0.5));
        float pulse = 0.7 + 0.3 * sin(uTime * 2.0 + uPhase);
        float drip = smoothstep(0.9, 1.0, fract(vUv.y * 3.0 - uTime * 0.4));
        float alpha = vertFade * horzFade * pulse + drip * horzFade * 0.6;
        vec3 col = uColor + vec3(0.45) * vertFade;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `;
    const nodeData = NODES.map((n) => {
      const p = project(n.lat, n.lon);
      const g = new THREE.Group();
      g.position.copy(p);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.07 * n.size, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending })
      );
      g.add(core);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.2 * n.size, 18, 18),
        new THREE.MeshBasicMaterial({ color: 0x84dcff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      g.add(halo);

      // Twin crossed planes for the beam (no billboard needed)
      const beamHeight = 4.2;
      const makeBeamPlane = () => {
        const geom = new THREE.PlaneGeometry(0.22 * n.size, beamHeight);
        geom.translate(0, beamHeight / 2, 0);
        return new THREE.Mesh(geom, new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: {
            uColor: { value: new THREE.Color(0x9ee3ff) },
            uTime:  { value: 0 },
            uPhase: { value: Math.random() * Math.PI * 2 }
          },
          vertexShader: beamVertexShader,
          fragmentShader: beamFragmentShader
        }));
      };
      const beamA = makeBeamPlane();
      const beamB = makeBeamPlane();
      beamB.rotation.y = Math.PI / 2;
      g.add(beamA, beamB);

      // Thin vertical tracer line way up high
      const traceGeom = new THREE.BufferGeometry().setAttribute(
        'position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 7, 0]), 3)
      );
      const trace = new THREE.Line(traceGeom, new THREE.LineBasicMaterial({
        color: 0x84dcff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending
      }));
      g.add(trace);

      scene.add(g);
      return { group: g, core, halo, beamA, beamB, phase: Math.random() * Math.PI * 2, info: n };
    });

    // Connection arcs between corridor neighbors
    const byId = (id) => NODES.find((x) => x.id === id);
    const connections = [
      ['ottawa', 'montreal'], ['montreal', 'rive-nord'], ['montreal', 'sherbrooke'],
      ['rive-nord', 'trois-rivieres'], ['trois-rivieres', 'quebec'], ['sherbrooke', 'trois-rivieres']
    ];
    const connectionCurves = [];
    connections.forEach(([aId, bId]) => {
      const a = byId(aId); const b = byId(bId);
      const pa = project(a.lat, a.lon);
      const pb = project(b.lat, b.lon);
      const dist = pa.distanceTo(pb);
      const mid = new THREE.Vector3((pa.x + pb.x) / 2, 0.35 + dist * 0.2, (pa.z + pb.z) / 2);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(pa.x, 0.05, pa.z), mid, new THREE.Vector3(pb.x, 0.05, pb.z)
      );
      connectionCurves.push(curve);
      const core = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, 0.010, 6, false),
        new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending })
      );
      const halo = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, 0.032, 6, false),
        new THREE.MeshBasicMaterial({ color: 0x4db8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending })
      );
      scene.add(halo, core);
    });

    // Connection flow particles — data flying between nodes
    const ARC_FLOW = 24;
    const arcFlowPositions = new Float32Array(ARC_FLOW * connectionCurves.length * 3);
    const arcFlowGeom = new THREE.BufferGeometry();
    arcFlowGeom.setAttribute('position', new THREE.BufferAttribute(arcFlowPositions, 3));
    const arcFlowPoints = new THREE.Points(arcFlowGeom, new THREE.PointsMaterial({
      color: 0xd6f4ff, size: 0.055, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    scene.add(arcFlowPoints);

    // Horizon sun glow — golfe du Saint-Laurent (nord-est)
    const sunPos = project(50.5, -65.5);
    sunPos.y = 0.4;
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xd6f4ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    sun.position.copy(sunPos);
    const sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x4db8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    sunHalo.position.copy(sunPos);
    scene.add(sunHalo, sun);

    // Starfield overhead
    const starCount = 500;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3]     = (Math.random() - 0.5) * 44;
      starPositions[i * 3 + 1] = 2.2 + Math.random() * 18;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    scene.add(new THREE.Points(starGeom, new THREE.PointsMaterial({
      color: 0xbfe4ff, size: 0.028, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending
    })));

    // Falling data "rain" particles (skywards to ground)
    const rainCount = 180;
    const rainPositions = new Float32Array(rainCount * 3);
    const rainSeeds = new Float32Array(rainCount);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3]     = (Math.random() - 0.5) * 18;
      rainPositions[i * 3 + 1] = Math.random() * 8;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
      rainSeeds[i] = Math.random();
    }
    const rainGeom = new THREE.BufferGeometry();
    rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x9ee3ff, size: 0.04, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const rain = new THREE.Points(rainGeom, rainMat);
    scene.add(rain);

    // City label overlays — projection 3D→2D dans update
    const labelContainer = document.getElementById('valley-labels');
    const labelByCity = {};
    if (labelContainer) {
      labelContainer.querySelectorAll('.valley-label').forEach((el) => {
        labelByCity[el.dataset.city] = el;
      });
    }
    const projVec = new THREE.Vector3();

    return {
      mount: valleyMount,
      scene,
      camera,
      renderer,
      nodeData,
      update(time) {
        // Slow camera sweep (amplitude réduite pour garder le cadrage)
        const sway = Math.sin(time * 0.09);
        camera.position.x = 0.0 + sway * 0.45;
        camera.position.y = 3.4 + Math.cos(time * 0.07) * 0.15;
        camera.position.z = 5.8 + Math.sin(time * 0.06) * 0.25;
        camera.lookAt(0.2 + sway * 0.08, 0.1, 0.0);

        // Beam shaders
        nodeData.forEach((n) => {
          n.beamA.material.uniforms.uTime.value = time;
          n.beamB.material.uniforms.uTime.value = time;
          n.halo.material.opacity = 0.45 + Math.sin(time * 1.8 + n.phase) * 0.22;
          n.core.scale.setScalar(1 + Math.sin(time * 2.6 + n.phase) * 0.16);
        });

        // Rain fall
        const pos = rainGeom.attributes.position.array;
        for (let i = 0; i < rainCount; i++) {
          pos[i * 3 + 1] -= 0.03 + rainSeeds[i] * 0.04;
          if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 7.5 + rainSeeds[i] * 0.6;
        }
        rainGeom.attributes.position.needsUpdate = true;

        // River flow particles — ouest→est le long du fleuve
        const flowArr = flowGeom.attributes.position.array;
        for (let i = 0; i < FLOW_COUNT; i++) {
          const t = (flowOffsets[i] + time * 0.05) % 1;
          const p = riverCurve.getPointAt(t);
          flowArr[i * 3]     = p.x;
          flowArr[i * 3 + 1] = p.y + 0.015;
          flowArr[i * 3 + 2] = p.z;
        }
        flowGeom.attributes.position.needsUpdate = true;

        // Arc flow particles — data entre nœuds
        const arcArr = arcFlowGeom.attributes.position.array;
        connectionCurves.forEach((curve, ci) => {
          for (let i = 0; i < ARC_FLOW; i++) {
            const t = ((i / ARC_FLOW) + time * 0.12 + ci * 0.17) % 1;
            const p = curve.getPointAt(t);
            const idx = (ci * ARC_FLOW + i) * 3;
            arcArr[idx]     = p.x;
            arcArr[idx + 1] = p.y;
            arcArr[idx + 2] = p.z;
          }
        });
        arcFlowGeom.attributes.position.needsUpdate = true;

        // Sun breathing
        sun.material.opacity = 0.48 + Math.sin(time * 0.6) * 0.12;
        sunHalo.material.opacity = 0.15 + Math.sin(time * 0.5) * 0.05;

        // Project city labels
        if (labelContainer) {
          const rect = valleyMount.getBoundingClientRect();
          nodeData.forEach((n) => {
            const el = labelByCity[n.info.id];
            if (!el) return;
            projVec.set(n.group.position.x, 0.55, n.group.position.z);
            projVec.project(camera);
            const x = (projVec.x * 0.5 + 0.5) * rect.width;
            const y = (-projVec.y * 0.5 + 0.5) * rect.height;
            const inFront = projVec.z < 1;
            if (inFront && x > -80 && x < rect.width + 80 && y > -40 && y < rect.height + 40) {
              el.style.transform = `translate3d(${x + 14}px, ${y - 14}px, 0)`;
              el.classList.add('is-visible');
            } else {
              el.classList.remove('is-visible');
            }
          });
        }
      },
      setMode() { /* valley palette is fixed */ }
    };
  };

  scenes.push(addHeroScene(), addRobotScene(), addTimelineScene());
  if (valleyMount) scenes.push(addValleyScene());
  scenes.forEach((sceneData) => {
    resizeScene(sceneData);
    sceneData.setMode();
  });

  const hudDepth = document.getElementById('hero-scene-depth');
  const hudVector = document.getElementById('hero-scene-vector');
  const hudNodes = document.getElementById('hero-scene-nodes');
  let hudTick = 0;

  const animate = () => {
    const time = performance.now() * 0.001;
    scenes.forEach((sceneData) => {
      sceneData.update(time);
      sceneData.renderer.render(sceneData.scene, sceneData.camera);
    });
    hudTick += 1;
    if (hudTick % 18 === 0) {
      const depth = (3.4 + Math.sin(time * 0.38) * 0.52).toFixed(1);
      const vector = Math.round(Math.sin(time * 0.29) * 28);
      const nodes = 128 + Math.round(Math.sin(time * 0.61) * 14);
      if (hudDepth) hudDepth.textContent = `${depth}x`;
      if (hudVector) hudVector.textContent = `${vector >= 0 ? '+' : ''}${vector}`;
      if (hudNodes) hudNodes.textContent = String(nodes);
    }
    rafId = window.requestAnimationFrame(animate);
  };

  const resizeAll = () => scenes.forEach(resizeScene);

  heroMount.parentElement?.addEventListener('pointermove', (event) => {
    const rect = heroMount.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
    pointer.y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
    pointer.active = true;
  });

  heroMount.parentElement?.addEventListener('pointerleave', () => {
    pointer.active = false;
  });

  window.addEventListener('resize', resizeAll);

  // ResizeObserver par mount — déclenche un resize quand le conteneur change de taille
  // (indispensable pour la vallée : le strip a height: 420px mais width dépend de --content,
  //  et le layout peut ne pas être finalisé au premier resizeScene synchrone).
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => resizeAll());
    scenes.forEach((sceneData) => ro.observe(sceneData.mount));
  }
  window.addEventListener('load', resizeAll);

  window.ISLThreeScenes = {
    setMode(nextMode) {
      currentMode = nextMode || currentMode;
      scenes.forEach((sceneData) => sceneData.setMode(currentMode));
    },
    setTimelineIndex(nextIndex) {
      currentTimelineIndex = Math.max(0, Math.min(3, Number(nextIndex) || 0));
      scenes.forEach((sceneData) => sceneData.setMode(currentMode));
    },
    setRobotFocus(nextFocus) {
      currentRobotFocus = nextFocus || currentRobotFocus;
    },
    destroy() {
      window.cancelAnimationFrame(rafId);
      scenes.forEach(({ renderer }) => renderer.dispose());
    }
  };

  document.body.classList.add('webgl-ready');
  window.dispatchEvent(new CustomEvent('isl:webgl-ready'));
  animate();
}