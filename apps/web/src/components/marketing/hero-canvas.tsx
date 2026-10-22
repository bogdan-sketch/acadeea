'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from 'next-themes';

/**
 * Scena three.js a hero-ului: „din haos, ordine”.
 *
 * Un câmp de particule plutește dezordonat (agitația dimineții în laborator)
 * și, pe măsură ce vizitatorul derulează, se așază într-un cadran: 7 inele
 * concentrice + 12 spițe-oră cu accent zmeură (Horele = orele). `progressRef`
 * (0→1) vine din scroll-ul urmărit în <Hero>; componenta e client-only
 * (import dinamic cu ssr:false) și se randează transparent peste fundalul
 * paginii, deci e automat corectă în light și dark.
 *
 * Buget: ≤3.400 particule pe desktop / 1.400 pe mobil, un singur draw call,
 * fără postprocesare; bucla rulează doar cât hero-ul e vizibil și se oprește
 * complet sub prefers-reduced-motion (un singur cadru static, ordonat).
 */

type HeroCanvasProps = {
  /** Progresul scroll-ului în hero, 0 = haos, 1 = cadran ordonat. */
  progressRef: { current: number };
  reducedMotion: boolean;
};

type Field = {
  chaos: Float32Array;
  order: Float32Array;
  /** phase / frecvență / amplitudine de plutire, per particulă. */
  seeds: Float32Array;
  /** variație de luminozitate per particulă, stabilă între teme. */
  shade: Float32Array;
  /** 1 = particulă cu accent zmeură (inele: aleator; spițele-oră: toate). */
  accent: Uint8Array;
};

const RING_RADII = [1.7, 2.28, 2.86, 3.44, 4.02, 4.6, 5.18];
const TICK_INNER_RADIUS = 5.75;
const NEUTRAL_LIGHT = '#55535a';
const NEUTRAL_DARK = '#b9b4bd';
const ACCENT_LIGHT = '#d4527b';
const ACCENT_DARK = '#e0688e';

function buildField(count: number): Field {
  const chaos = new Float32Array(count * 3);
  const order = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  const shade = new Float32Array(count);
  const accent = new Uint8Array(count);

  // ~9% din particule formează cele 12 spițe-oră; restul, inelele.
  const tickCount = Math.floor(count * 0.09);
  const ringTotal = count - tickCount;
  const weightSum = RING_RADII.reduce((a, b) => a + b, 0);

  let i = 0;
  for (let k = 0; k < RING_RADII.length; k++) {
    const isLast = k === RING_RADII.length - 1;
    const n = isLast ? ringTotal - i : Math.floor((RING_RADII[k] / weightSum) * ringTotal);
    for (let j = 0; j < n && i < ringTotal; j++, i++) {
      const angle = (j / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.05;
      const radius = RING_RADII[k] + (Math.random() - 0.5) * 0.08;
      order[i * 3] = Math.cos(angle) * radius;
      order[i * 3 + 1] = Math.sin(angle) * radius;
      order[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
      if (Math.random() < 0.1) accent[i] = 1;
    }
  }
  // Spițele-oră: 12 linii radiale scurte dincolo de ultimul inel.
  for (; i < count; i++) {
    const spokeAngle = ((i % 12) / 12) * Math.PI * 2 + Math.PI / 2;
    const angle = spokeAngle + (Math.random() - 0.5) * 0.045;
    const radius = TICK_INNER_RADIUS + Math.random() * 0.55;
    order[i * 3] = Math.cos(angle) * radius;
    order[i * 3 + 1] = Math.sin(angle) * radius;
    order[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
    accent[i] = 1;
  }

  for (let p = 0; p < count; p++) {
    chaos[p * 3] = (Math.random() - 0.5) * 17;
    chaos[p * 3 + 1] = (Math.random() - 0.5) * 11;
    chaos[p * 3 + 2] = (Math.random() - 0.5) * 6;
    seeds[p * 3] = Math.random() * Math.PI * 2;
    seeds[p * 3 + 1] = 0.25 + Math.random() * 0.5;
    seeds[p * 3 + 2] = 0.18 + Math.random() * 0.5;
    shade[p] = Math.random() - 0.5;
  }

  return { chaos, order, seeds, shade, accent };
}

function writeColors(target: Float32Array, field: Field, dark: boolean) {
  const neutral = new THREE.Color(dark ? NEUTRAL_DARK : NEUTRAL_LIGHT);
  const raspberry = new THREE.Color(dark ? ACCENT_DARK : ACCENT_LIGHT);
  const spread = dark ? 0.22 : 0.16;
  const c = new THREE.Color();
  for (let p = 0; p < field.accent.length; p++) {
    c.copy(field.accent[p] === 1 ? raspberry : neutral);
    c.offsetHSL(0, 0, field.shade[p] * spread);
    target[p * 3] = c.r;
    target[p * 3 + 1] = c.g;
    target[p * 3 + 2] = c.b;
  }
}

/** Sprite circular moale pentru particule (fără texturi externe). */
function makeDotTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

export default function HeroCanvas({ progressRef, reducedMotion }: HeroCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ setDark: (d: boolean) => void } | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const count = isMobile ? 1400 : 3400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 15);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    host.appendChild(canvas);

    const field = buildField(count);
    const positions = new Float32Array(reducedMotion ? field.order : field.chaos);
    const colors = new Float32Array(count * 3);
    writeColors(colors, field, document.documentElement.classList.contains('dark'));

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const texture = makeDotTexture();
    const material = new THREE.PointsMaterial({
      size: isMobile ? 0.09 : 0.105,
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      alphaTest: 0.02,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    const group = new THREE.Group();
    group.rotation.x = -0.3;
    group.add(points);
    scene.add(group);

    const renderOnce = () => renderer.render(scene, camera);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Cadranul (rază ~6.3) trebuie să încapă pe orice lățime de ecran.
      const worldWidth =
        2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
      group.scale.setScalar(Math.min(1, worldWidth / 13.5));
      if (reducedMotion) renderOnce();
    };
    resize();
    window.addEventListener('resize', resize);

    apiRef.current = {
      setDark(d: boolean) {
        writeColors(colors, field, d);
        geometry.getAttribute('color').needsUpdate = true;
        if (reducedMotion) renderOnce();
      },
    };

    let raf = 0;
    let visible = true;
    let smoothed = reducedMotion ? 1 : 0;
    const clock = new THREE.Clock();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const delta = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      // Netezim progresul de scroll, apoi îl trecem prin smoothstep.
      smoothed += (progressRef.current - smoothed) * Math.min(1, delta * 4.5);
      const u = smoothed * smoothed * (3 - 2 * smoothed);
      const drift = 1 - u;
      const { chaos, order, seeds } = field;
      for (let p = 0; p < count; p++) {
        const p3 = p * 3;
        const phase = seeds[p3];
        const freq = seeds[p3 + 1];
        const amp = seeds[p3 + 2] * drift;
        const cx = chaos[p3] + Math.sin(t * freq + phase) * amp;
        const cy = chaos[p3 + 1] + Math.cos(t * freq * 0.9 + phase * 1.7) * amp;
        const cz = chaos[p3 + 2] + Math.sin(t * freq * 0.7 + phase * 2.3) * amp * 0.6;
        positions[p3] = cx + (order[p3] - cx) * u;
        positions[p3 + 1] = cy + (order[p3 + 1] - cy) * u;
        positions[p3 + 2] = cz + (order[p3 + 2] - cz) * u;
      }
      geometry.getAttribute('position').needsUpdate = true;
      // Odată ordonat, cadranul se rotește imperceptibil — ca un ceas.
      points.rotation.z = t * 0.045 * u;
      renderer.render(scene, camera);
    };

    const startStop = () => {
      cancelAnimationFrame(raf);
      if (!reducedMotion && visible) {
        clock.getDelta();
        raf = requestAnimationFrame(tick);
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      startStop();
    });
    io.observe(host);

    renderOnce();
    startStop();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', resize);
      apiRef.current = null;
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      host.removeChild(canvas);
    };
  }, [progressRef, reducedMotion]);

  // Recolorăm în loc să reconstruim scena când se schimbă tema.
  useEffect(() => {
    if (resolvedTheme) apiRef.current?.setDark(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  return <div ref={hostRef} aria-hidden className="absolute inset-0" />;
}
