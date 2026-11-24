import { Component, useEffect, useRef, useState, type ReactNode } from 'react';

const REDUCED = '(prefers-reduced-motion: reduce)';

export function useReducedMotion() {
  const [v, set] = useState(() => matchMedia(REDUCED).matches);
  useEffect(() => {
    const mq = matchMedia(REDUCED);
    const on = () => set(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return v;
}

let webgl: boolean | undefined;
export function hasWebGL() {
  if (webgl === undefined) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      webgl = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** True while the element is on screen and the tab is visible: 3D never runs unseen. */
export function useVisible<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [tab, setTab] = useState(!document.hidden);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(!!e?.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    const on = () => setTab(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', on);
    };
  }, []);
  return [ref, onScreen && tab] as const;
}

export class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error('3D view failed, showing the flat version instead', e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
