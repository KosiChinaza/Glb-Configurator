import { lazy, Suspense, useEffect, useState } from 'react';
import { useCapabilities } from './useCapabilities.js';
import Poster from './ui/Poster.jsx';

// The whole 3D stack (three, R3F, drei, leva) lives in this chunk.
// It is only downloaded after the page shell + poster have painted.
const Experience = lazy(() => import('./three/Experience.jsx'));

const whenIdle = (cb) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 200);

export default function App() {
  const { allow3D, reason, canRender } = useCapabilities();
  const [want3D, setWant3D] = useState(false);
  const [optIn, setOptIn] = useState(false);

  // Capable device: start fetching the 3D chunk once the browser is idle.
  useEffect(() => {
    if (!allow3D) return;
    const id = whenIdle(() => setWant3D(true));
    return () => (window.cancelIdleCallback ? cancelIdleCallback(id) : clearTimeout(id));
  }, [allow3D]);

  const show3D = (allow3D && want3D) || optIn;

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          GLB <span>Configurator</span>
        </h1>
        <p className="hint">
          {show3D
            ? 'Drag to orbit · pinch / scroll to zoom · tap a part to edit its material · drop a .glb anywhere'
            : 'Interactive 3D model viewer'}
        </p>
      </header>

      <main className="stage">
        {show3D ? (
          <Suspense fallback={<Poster loading />}>
            <Experience />
          </Suspense>
        ) : (
          <Poster
            loading={allow3D}
            reason={allow3D ? null : reason}
            onLoad3D={!allow3D && canRender ? () => setOptIn(true) : null}
          />
        )}
      </main>
    </div>
  );
}
