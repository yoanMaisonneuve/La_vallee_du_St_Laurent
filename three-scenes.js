import * as THREE from 'three';

const heroMount = document.getElementById('hero-webgl');
const robotMount = document.getElementById('robot-webgl');
const timelineMount = document.getElementById('timeline-webgl');
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

    const ambient = new THREE.AmbientLight(0x88dfff, 0.8);
    const point = new THREE.PointLight(0x4dbdff, 3.2, 20, 2);
    point.position.set(0.5, 1.2, 3.2);
    scene.add(ambient, point);

    const starCount = 600;
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
      size: 0.038,
      transparent: true,
      opacity: 0.94,
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
        opacity: 0.08,
        wireframe: true
      })
    );
    root.add(halo);

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
      }
    };
  };

  const addRobotScene = () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    camera.position.set(0, 0.1, 6.8);
    const renderer = makeRenderer(robotMount);

    const root = new THREE.Group();
    scene.add(root);
    scene.add(new THREE.AmbientLight(0x88dfff, 0.66));
    const light = new THREE.PointLight(0x7dddff, 2.2, 20, 2);
    light.position.set(2, 2, 4);
    scene.add(light);

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.08, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().primary), transparent: true, opacity: 0.14, wireframe: true })
    );
    root.add(core);

    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.72, 0.18, 160, 18),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().secondary), wireframe: true, transparent: true, opacity: 0.24 })
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
        new THREE.RingGeometry(0.16, 0.22, 28),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(getPalette().accent), transparent: true, opacity: index === 0 ? 0.72 : 0.22, side: THREE.DoubleSide })
      );
      marker.position.set(-1.8 + index * 1.2, 0, -index * 1.4);
      root.add(marker);
      return marker;
    });

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
          loop.material.opacity += (((Math.abs(index - currentTimelineIndex) <= 1 ? 0.3 : 0.1) - loop.material.opacity) * 0.08);
        });
        beam.rotation.x = Math.sin(time * 0.52) * 0.16;
        markers.forEach((marker, index) => {
          marker.material.opacity += (((index === currentTimelineIndex ? 0.82 : 0.18) - marker.material.opacity) * 0.1);
          const targetScale = index === currentTimelineIndex ? 1.28 : 1;
          marker.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
        });
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

  scenes.push(addHeroScene(), addRobotScene(), addTimelineScene());
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