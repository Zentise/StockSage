import { Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Odds } from '../api/client';
import { money } from '../lib/format';
import { LabelLayer, Projector, useLabelNodes, type Label } from './labels';
import { useReducedMotion, useVisible } from './stage';

/* Thousands of simulated futures as terrain. Left to right is time, depth is price, and the
   ridge is where price is most likely to be. Past the target it turns teal, past the stop red. */

const L = 13;
const P = 9;
const H = 3.6;

interface Levels {
  entry: number;
  stop: number;
  target: number;
}

function smooth(row: number[]): number[] {
  return row.map((_, i) => {
    let a = 0, w = 0;
    for (let k = -2; k <= 2; k++) {
      const v = row[i + k];
      if (v === undefined) continue;
      const g = 3 - Math.abs(k);
      a += v * g;
      w += g;
    }
    return a / w;
  });
}

function Terrain({ odds, levels, still }: { odds: Odds; levels: Levels; still: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const { geometry, heights } = useMemo(() => {
    const nx = odds.days, nz = odds.prices.length;
    const rows = odds.density.map(smooth);
    // Early days are a needle and late days a blanket; a soft root keeps both readable.
    const peak = Math.max(...rows.flat()) || 1;
    const geometry = new THREE.BufferGeometry();
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), heights = new Float32Array(nx * nz);
    const teal = new THREE.Color('#12b8b0'), red = new THREE.Color('#ea5455'), mid = new THREE.Color('#6f7fe8'), dark = new THREE.Color('#151b45');
    const up = levels.target > levels.entry;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const n = i * nz + j, v = rows[i]![j]!, price = odds.prices[j]!;
        const f = Math.pow(v / peak, 0.62);
        heights[n] = f * H;
        pos[n * 3] = (i / (nx - 1) - 0.5) * L;
        pos[n * 3 + 2] = (0.5 - j / (nz - 1)) * P;
        const won = up ? price >= levels.target : price <= levels.target;
        const lost = up ? price <= levels.stop : price >= levels.stop;
        const c = dark.clone().lerp(won ? teal : lost ? red : mid, Math.min(1, 0.2 + f * 1.6));
        c.toArray(col, n * 3);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < nx - 1; i++) {
      for (let j = 0; j < nz - 1; j++) {
        const a = i * nz + j, b = a + nz;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geometry.setIndex(idx);
    return { geometry, heights };
  }, [odds, levels.entry, levels.stop, levels.target]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const t = useRef(0);
  useEffect(() => {
    t.current = still ? 1 : 0;
    const p = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (still) {
      for (let n = 0; n < heights.length; n++) p.setY(n, heights[n]!);
      p.needsUpdate = true;
      geometry.computeVertexNormals();
    }
    invalidate();
  }, [geometry, heights, still, invalidate]);
  useFrame((_, dt) => {
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + Math.min(dt, 0.05) * 1.1);
    const p = geometry.getAttribute('position') as THREE.BufferAttribute;
    const nz = odds.prices.length;
    for (let n = 0; n < heights.length; n++) {
      // Unfolds from today outwards: you watch certainty spread into possibility.
      const lag = (Math.floor(n / nz) / odds.days) * 0.6;
      const k = Math.min(1, Math.max(0, (t.current - lag) / 0.4));
      p.setY(n, heights[n]! * (1 - Math.pow(1 - k, 3)));
    }
    p.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <group>
      <mesh ref={mesh} geometry={geometry}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.45} metalness={0.15} emissive="#1a2058" emissiveIntensity={0.35} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial wireframe color="#aab4ff" transparent opacity={0.09} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Wall({ z, color }: { z: number; color: string }) {
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, H * 0.42, 0]}>
        <planeGeometry args={[L, H * 0.84]} />
        <meshBasicMaterial color={color} transparent opacity={0.11} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Line points={[[-L / 2, 0.02, 0], [L / 2, 0.02, 0]]} color={color} lineWidth={2} />
      <Line points={[[-L / 2, H * 0.84, 0], [L / 2, H * 0.84, 0]]} color={color} lineWidth={1} transparent opacity={0.5} />
    </group>
  );
}

function Rig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const far = size.width < 520 ? 1.85 : size.width / size.height < 1.65 ? 1.2 : 1;
    camera.position.set(5.6 * far, 7.6 * far, 13.2 * far);
    camera.lookAt(0.9, 0.5, 0.2);
  }, [camera, size]);
  return null;
}

export default function OddsSurface({ odds, levels, ticker, className = '' }: { odds: Odds; levels: Levels; ticker: string; className?: string }) {
  const [box, visible] = useVisible<HTMLDivElement>();
  const still = useReducedMotion();
  const lo = odds.prices[0]!, hi = odds.prices[odds.prices.length - 1]!;
  const z = (price: number) => (0.5 - Math.min(1, Math.max(0, (price - lo) / (hi - lo)))) * P;
  const nodes = useLabelNodes();
  const tag = (key: string, price: number, text: string, cls: string): Label => ({
    key, at: [L / 2 + 0.25, 0, z(price)], anchor: [0, -0.5],
    node: <div className="num rounded bg-deep/70 px-1.5 py-0.5 text-[11px] leading-tight whitespace-nowrap"><span className={cls}>{text}</span> {money(price, ticker, 0)}</div>,
  });
  const day = (key: string, x: number, text: string): Label => ({ key, at: [x, 0, P / 2 + 0.35], anchor: [-0.5, 0], node: <span className="text-[12px] whitespace-nowrap text-ink3">{text}</span> });
  const labels: Label[] = [
    tag('target', levels.target, 'Target', 'up'), tag('entry', levels.entry, 'Entry', 'text-gold'), tag('stop', levels.stop, 'Stop', 'down'),
    day('first', -L / 2 + 0.3, 'Day 1'), day('last', L / 2 - 0.3, `Day ${odds.days}`),
  ];
  return (
    <div ref={box} className={`relative cursor-grab ${className}`} role="img"
      aria-label={`Simulated price outcomes over ${odds.days} sessions. Target first ${Math.round(odds.p_target * 100)} percent, stop first ${Math.round(odds.p_stop * 100)} percent.`}>
      <Canvas frameloop={still ? 'demand' : visible ? 'always' : 'never'} dpr={[1, 1.75]} camera={{ fov: 36, near: 0.5, far: 80, position: [6, 7, 13] }} gl={{ antialias: true, alpha: true }}>
        <Rig />
        <hemisphereLight args={['#b9c1ff', '#0a0e24', 1.2]} />
        <directionalLight position={[-6, 9, 5]} intensity={2.2} color="#ffe2ad" />
        <directionalLight position={[8, 3, -6]} intensity={0.9} color="#6f7fe8" />
        <gridHelper args={[L, 12, '#272e5e', '#1a2048']} position={[0, -0.03, 0]} scale={[1, 1, P / L]} />
        <Terrain odds={odds} levels={levels} still={still} />
        <Wall z={z(levels.target)} color="#12b8b0" />
        <Wall z={z(levels.stop)} color="#ea5455" />
        <Projector labels={labels} nodes={nodes} />
        <Line points={[[-L / 2, 0.03, z(levels.entry)], [L / 2, 0.03, z(levels.entry)]]} color="#f2b63c" lineWidth={2} dashed dashSize={0.3} gapSize={0.2} />
        <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.35} maxPolarAngle={1.4} minAzimuthAngle={-0.9} maxAzimuthAngle={1.5} enableDamping target={[0.9, 0.5, 0.2]} />
      </Canvas>
      <LabelLayer labels={labels} nodes={nodes} />
    </div>
  );
}
