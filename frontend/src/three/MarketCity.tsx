import { OrbitControls, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Constituent } from '../api/client';
import { money, pct, symbol, tone } from '../lib/format';
import { squarify } from '../lib/treemap';
import { LabelLayer, Projector, useLabelNodes, type Label } from './labels';
import { useReducedMotion, useVisible } from './stage';

/* A treemap you can walk around. Plot size = how much money changed hands today,
   height = how far the price moved, colour = which way. */

const W = 22;
const D = 14;
const UP = new THREE.Color('#0ea5a5');
const DOWN = new THREE.Color('#ea5455');
const FLAT = new THREE.Color('#3d467f');

interface Tower {
  s: Constituent;
  x: number;
  z: number;
  w: number;
  d: number;
  pw: number;
  pd: number;
  h: number;
  color: THREE.Color;
  delay: number;
}
interface District {
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export function layout(stocks: Constituent[]): { towers: Tower[]; districts: District[] } {
  const groups = new Map<string, Constituent[]>();
  for (const s of stocks) groups.set(s.sector, [...(groups.get(s.sector) ?? []), s]);
  // Square root keeps the giants from swallowing the map; the floor keeps every plot clickable.
  const weight = (s: Constituent) => Math.max(Math.sqrt(s.turnover || 0), 1);
  const floor = stocks.reduce((a, s) => a + weight(s), 0) / stocks.length / 2.2;
  const wt = (s: Constituent) => Math.max(weight(s), floor);
  const names = [...groups.keys()];
  const plots = squarify(names.map((n) => groups.get(n)!.reduce((a, s) => a + wt(s), 0)), { x: -W / 2, y: -D / 2, w: W, h: D });
  const towers: Tower[] = [];
  const districts: District[] = [];
  names.forEach((n, i) => {
    const p = plots[i]!;
    districts.push({ name: n, x: p.x + p.w / 2, z: p.y + p.h / 2, w: p.w - 0.16, d: p.h - 0.16 });
    const members = groups.get(n)!;
    squarify(members.map(wt), { x: p.x + 0.2, y: p.y + 0.2, w: Math.max(p.w - 0.4, 0.2), h: Math.max(p.h - 0.4, 0.2) }).forEach((c, j) => {
      const s = members[j]!;
      const m = Math.min(Math.abs(s.change_pct), 6);
      const x = c.x + c.w / 2, z = c.y + c.h / 2;
      towers.push({
        s, x, z, pw: Math.max(c.w - 0.1, 0.1), pd: Math.max(c.h - 0.1, 0.1),
        w: Math.max(Math.min(c.w, c.h * 1.5) * 0.56, 0.16), d: Math.max(Math.min(c.h, c.w * 1.5) * 0.56, 0.16), h: 0.12 + m * 0.98,
        color: FLAT.clone().lerp(s.change_pct >= 0 ? UP : DOWN, Math.min(1, 0.25 + m / 1.8)),
        delay: Math.hypot(x, z) * 0.045,
      });
    });
  });
  return { towers, districts };
}

const ROOT = new THREE.Color('#141a44');
const WHITE = new THREE.Color('#ffffff');

/** A unit box whose base is dark and whose top carries the colour, so towers glow upwards. */
function towerGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  const c = new Float32Array(p.count * 3);
  for (let n = 0; n < p.count; n++) c.fill(p.getY(n) > 0.5 ? 1 : 0.16, n * 3, n * 3 + 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const TOWER = towerGeometry();
const EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));

function Pillar({ t, hot, onHover, onPick, still }: { t: Tower; hot: boolean; onHover: (t: Tower | null) => void; onPick: (k: string) => void; still: boolean }) {
  const g = useRef<THREE.Group>(null);
  const body = useRef<THREE.MeshStandardMaterial>(null);
  const edge = useRef<THREE.LineBasicMaterial>(null);
  const plot = useRef<THREE.MeshStandardMaterial>(null);
  const born = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => { invalidate(); }, [t, hot, invalidate]);
  useFrame((_, dt) => {
    if (!g.current || !body.current || !edge.current || !plot.current) return;
    born.current += dt;
    const target = still || born.current > t.delay ? t.h : 0.02;
    const k = still ? 1 : 1 - Math.exp(-Math.min(dt, 0.05) * 5);
    g.current.scale.y += (target - g.current.scale.y) * k;
    body.current.color.lerp(t.color, k);
    body.current.emissive.copy(t.color);
    body.current.emissiveIntensity = hot ? 0.6 : 0.15;
    edge.current.color.copy(t.color).lerp(WHITE, hot ? 0.85 : 0.35);
    edge.current.opacity = hot ? 1 : 0.55;
    plot.current.color.copy(ROOT).lerp(t.color, hot ? 0.5 : 0.2);
  });
  return (
    <group
      position={[t.x, 0, t.z]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(t); }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onPick(t.s.ticker); } }}
    >
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[t.pw, 0.06, t.pd]} />
        <meshStandardMaterial ref={plot} color={ROOT} roughness={0.7} metalness={0.2} />
      </mesh>
      <group ref={g} position={[0, 0.05, 0]} scale={[t.w, 0.02, t.d]}>
        <mesh geometry={TOWER} castShadow receiveShadow>
          <meshStandardMaterial ref={body} vertexColors color={FLAT} roughness={0.42} metalness={0.2} />
        </mesh>
        <lineSegments geometry={EDGES}>
          <lineBasicMaterial ref={edge} transparent opacity={0.55} toneMapped={false} />
        </lineSegments>
      </group>
    </group>
  );
}

function Rig({ cinematic }: { cinematic: boolean }) {
  const { camera, size } = useThree();
  useEffect(() => {
    // Pull back on narrow screens so the whole market stays in frame.
    const aspect = size.width / size.height;
    const far = aspect < 1 ? 1.8 : aspect < 1.45 ? 1.3 : aspect < 1.8 ? 1.1 : 1;
    const base = cinematic ? [-16, 12, 22] : [-10.5, 15.5, 21];
    camera.position.set(base[0]! * far, base[1]! * far, base[2]! * far);
    camera.lookAt(0, -0.1, 0);
  }, [camera, size, cinematic]);
  return null;
}

interface Props {
  stocks: Constituent[];
  onPick: (ticker: string) => void;
  cinematic?: boolean;
  className?: string;
}

export default function MarketCity({ stocks, onPick, cinematic = false, className = '' }: Props) {
  const [box, visible] = useVisible<HTMLDivElement>();
  const still = useReducedMotion();
  const [hover, setHover] = useState<Tower | null>(null);
  const [touched, setTouched] = useState(false);
  const { towers, districts } = useMemo(() => layout(stocks), [stocks]);
  const hot = hover ? towers.find((t) => t.s.ticker === hover.s.ticker) ?? null : null;
  const leaders = useMemo(
    () => [...towers].sort((a, b) => Math.abs(b.s.change_pct) - Math.abs(a.s.change_pct)).slice(0, 4),
    [towers],
  );

  const nodes = useLabelNodes();
  const labels = useMemo<Label[]>(() => [
    ...leaders.filter((t) => t.s.ticker !== hot?.s.ticker).map((t): Label => ({
      key: t.s.ticker, at: [t.x, t.h + 0.1, t.z], anchor: [-0.5, -1.15],
      node: (
        <span className="num rounded-md bg-deep/85 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-ink">
          {symbol(t.s.ticker)} <span className={tone(t.s.change_pct)}>{pct(t.s.change_pct, 1)}</span>
        </span>
      ),
    })),
    ...(hot ? [{
      key: 'hover', at: [hot.x, hot.h + 0.1, hot.z], anchor: [-0.5, -1.15],
      node: (
        <div className="tip">
          <div className="title">{hot.s.name}</div>
          <div className="text-ink3">{hot.s.sector}</div>
          <div className="num mt-1">{money(hot.s.price, hot.s.ticker)} <span className={tone(hot.s.change_pct)}>{pct(hot.s.change_pct)}</span></div>
        </div>
      ),
    } satisfies Label] : []),
  ], [leaders, hot]);

  return (
    <div ref={box} className={`relative ${className}`} style={{ cursor: hot ? 'pointer' : 'grab' }}>
      <Canvas
        frameloop={still ? 'demand' : visible ? 'always' : 'never'}
        dpr={[1, 1.75]}
        shadows
        camera={{ fov: 34, near: 1, far: 120, position: [-8.5, 12, 14] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => setHover(null)}
      >
        <fog attach="fog" args={['#0a0e24', 34, 78]} />
        <Rig cinematic={cinematic} />
        <hemisphereLight args={['#b9c1ff', '#10153a', 1.1]} />
        <directionalLight position={[-9, 15, 6]} intensity={2.1} color="#ffe2ad" castShadow shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.0006} />
        <pointLight position={[12, 5, -9]} intensity={22} color="#6f7fe8" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.26, 0]} receiveShadow>
          <planeGeometry args={[140, 140]} />
          <shadowMaterial transparent opacity={0.5} />
        </mesh>
        <gridHelper args={[110, 80, '#1c2350', '#151b42']} position={[0, -0.25, 0]} />
        {districts.map((d) => (
          <RoundedBox key={d.name} args={[d.w, 0.22, d.d]} radius={0.08} smoothness={2} position={[d.x, -0.12, d.z]} receiveShadow>
            <meshStandardMaterial color="#0f1436" roughness={0.8} metalness={0.15} />
          </RoundedBox>
        ))}
        {towers.map((t) => (
          <Pillar key={t.s.ticker} t={t} hot={hot?.s.ticker === t.s.ticker} onHover={setHover} onPick={onPick} still={still} />
        ))}
        <Projector labels={labels} nodes={nodes} />
        <OrbitControls
          target={[0, -0.1, 0]}
          enablePan={false}
          enableZoom={false}
          minPolarAngle={0.55}
          maxPolarAngle={1.32}
          autoRotate={!still && !touched && !hot}
          autoRotateSpeed={cinematic ? 0.55 : 0.28}
          enableDamping
          onStart={() => setTouched(true)}
        />
      </Canvas>
      <LabelLayer labels={labels} nodes={nodes} />
    </div>
  );
}
