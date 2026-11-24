import { useFrame, useThree } from '@react-three/fiber';
import { useRef, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';

export interface Label {
  key: string;
  at: [number, number, number];
  /** Fractions of the label's own size to shift by. */
  anchor?: [number, number];
  node: ReactNode;
}

type Nodes = RefObject<Map<string, HTMLDivElement>>;

/** Lives inside the Canvas: moves plain DOM labels to follow points in the scene. */
export function Projector({ labels, nodes }: { labels: Label[]; nodes: Nodes }) {
  const { camera, size } = useThree();
  const v = useRef(new THREE.Vector3());
  useFrame(() => {
    camera.updateMatrixWorld();
    for (const l of labels) {
      const el = nodes.current.get(l.key);
      if (!el) continue;
      v.current.set(...l.at).project(camera);
      const [ax, ay] = l.anchor ?? [-0.5, -0.5];
      const x = (v.current.x * 0.5 + 0.5) * size.width, y = (-v.current.y * 0.5 + 0.5) * size.height;
      // Keep the whole label on screen: on a phone the edges are always close.
      const w = el.offsetWidth, h = el.offsetHeight;
      const left = Math.max(4, Math.min(size.width - w - 4, x + ax * w)), top = Math.max(4, Math.min(size.height - h - 4, y + ay * h));
      el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
      el.style.visibility = v.current.z < 1 ? 'visible' : 'hidden';
    }
  });
  return null;
}

/** Lives beside the Canvas, on top of it. */
export function LabelLayer({ labels, nodes }: { labels: Label[]; nodes: Nodes }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {labels.map((l) => (
        <div key={l.key} className="absolute top-0 left-0" style={{ visibility: 'hidden', willChange: 'transform' }}
          ref={(el) => {
            if (el) nodes.current.set(l.key, el);
            return () => { nodes.current.delete(l.key); };
          }}>
          {l.node}
        </div>
      ))}
    </div>
  );
}

export const useLabelNodes = (): Nodes => useRef(new Map<string, HTMLDivElement>());
