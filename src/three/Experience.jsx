import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, invalidate } from '@react-three/fiber';
import { OrbitControls, Stage, Stats, PerformanceMonitor, useGLTF, Html } from '@react-three/drei';
import { Leva, useControls, button } from 'leva';
import Model from './Model.jsx';
import Lighting from './Lighting.jsx';

const DEFAULT_URL = '/models/robot.glb';
const DEFAULT_NAME = 'robot.glb (default)';
useGLTF.preload(DEFAULT_URL);

const debug = new URLSearchParams(window.location.search).has('debug');
const isNarrow = () => window.matchMedia('(max-width: 640px)').matches;
const isCoarse = () => window.matchMedia('(pointer: coarse)').matches;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Experience() {
  const [model, setModel] = useState({ url: DEFAULT_URL, name: DEFAULT_NAME });
  const [materials, setMaterials] = useState([]); // [{ name, material, original }]
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dpr, setDpr] = useState(isCoarse() ? 1.5 : 2); // phones start a bit lower
  const fileInput = useRef(null);
  const byName = useRef(new Map());

  /* ------------------------------ loading files ----------------------------- */

  const loadFile = useCallback((file) => {
    if (!file) return;
    if (!/\.glb$/i.test(file.name)) {
      setError(`"${file.name}" isn't a .glb file. Export your model as binary glTF (.glb) and try again.`);
      return;
    }
    setError(null);
    setModel((prev) => {
      if (prev.url.startsWith('blob:')) {
        useGLTF.clear(prev.url);
        URL.revokeObjectURL(prev.url);
      }
      return { url: URL.createObjectURL(file), name: file.name };
    });
  }, []);

  const resetModel = useCallback(() => {
    setError(null);
    setModel((prev) => {
      if (prev.url.startsWith('blob:')) {
        useGLTF.clear(prev.url);
        URL.revokeObjectURL(prev.url);
      }
      return { url: DEFAULT_URL, name: DEFAULT_NAME };
    });
  }, []);

  // Drag-and-drop anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    const enter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setDragging(true); };
    const over = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      loadFile(e.dataTransfer.files[0]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [loadFile]);

  /* ------------------------------ configurator ------------------------------ */

  const names = materials.map((m) => m.name);
  const namesKey = names.join('|');

  // Push the selected material's current values into the panel (without re-applying them).
  const syncPanel = useRef(() => {});
  const [, setMat] = useControls(
    'Material',
    () => ({
      part: {
        label: 'material',
        options: names.length ? names : ['—'],
        value: names[0] ?? '—',
        onChange: (name) => syncPanel.current(name),
      },
      color: {
        value: '#ffffff',
        onChange: (v, _p, ctx) => ctx.fromPanel && applyToSelected((m) => m.color?.set(v)),
      },
      metalness: {
        value: 0, min: 0, max: 1, step: 0.01,
        onChange: (v, _p, ctx) => ctx.fromPanel && applyToSelected((m) => 'metalness' in m && (m.metalness = v)),
      },
      roughness: {
        value: 0.5, min: 0, max: 1, step: 0.01,
        onChange: (v, _p, ctx) => ctx.fromPanel && applyToSelected((m) => 'roughness' in m && (m.roughness = v)),
      },
      'reset materials': button(() => resetMaterials()),
    }),
    [namesKey]
  );

  const selected = useRef(null);
  function applyToSelected(fn) {
    const entry = byName.current.get(selected.current);
    if (!entry) return;
    fn(entry.material);
    entry.material.needsUpdate = true;
    invalidate();
  }

  syncPanel.current = (name) => {
    const entry = byName.current.get(name);
    if (!entry) return;
    selected.current = name;
    const m = entry.material;
    setMat({
      color: m.color ? '#' + m.color.getHexString() : '#ffffff',
      metalness: m.metalness ?? 0,
      roughness: m.roughness ?? 1,
    });
  };

  function resetMaterials() {
    for (const { material, original } of byName.current.values()) {
      material.color?.copy(original.color);
      if ('metalness' in material) material.metalness = original.metalness;
      if ('roughness' in material) material.roughness = original.roughness;
      material.needsUpdate = true;
    }
    syncPanel.current(selected.current);
    invalidate();
  }

  const scene = useControls('Scene', {
    environment: {
      value: 'studio',
      options: {
        'Studio (built-in, offline)': 'studio',
        'City (HDRI)': 'city',
        'Sunset (HDRI)': 'sunset',
        'Dawn (HDRI)': 'dawn',
        'Warehouse (HDRI)': 'warehouse',
        'Forest (HDRI)': 'forest',
        'Night (HDRI)': 'night',
      },
    },
    // No auto-rotate for people who asked for reduced motion but opted into 3D anyway.
    'auto-rotate': { value: prefersReducedMotion() ? 0 : 1.5, min: 0, max: 10, step: 0.1 },
    wireframe: false,
    shadows: true,
    background: '#15171c',
  });

  useControls('Model', {
    'upload GLB…': button(() => fileInput.current?.click()),
    'load default': button(() => resetModel()),
  });

  // Called by <Model> once a GLB is parsed: register its materials.
  const onReady = useCallback((list) => {
    byName.current = new Map(list.map((e) => [e.name, e]));
    setMaterials(list);
  }, []);

  // When the material list changes, select + sync the first one.
  useEffect(() => {
    // Setting `part` fires its onChange, which syncs color/metalness/roughness.
    if (names.length) {
      setMat({ part: names[0] });
      syncPanel.current(names[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  // Tap/click on a part → select its material in the panel.
  const onPick = useCallback((name) => setMat({ part: name }), [setMat]);

  const rotate = scene['auto-rotate'];

  return (
    <div className="experience">
      {/* `fill` renders leva inside our own container so CSS controls its position on mobile */}
      <div className="leva-wrap">
        <Leva fill collapsed={isNarrow()} titleBar={{ title: 'Configurator' }} />
      </div>

      <Canvas
        className="canvas"
        dpr={[1, dpr]}
        // Render continuously only while something is animating; otherwise on demand.
        frameloop={rotate > 0 ? 'always' : 'demand'}
        camera={{ position: [0, 1.5, 6], fov: 40 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={[scene.background]} />
        {/* Drop resolution if the frame rate tanks (and recover if it improves). */}
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(isCoarse() ? 1.5 : 2)} />

        <Lighting preset={scene.environment} />

        <ModelErrorBoundary key={model.url} onError={(msg) => { resetModel(); setError(msg); }}>
          <Suspense fallback={<Html center className="pill">Loading model…</Html>}>
            <Stage
              environment={null}
              intensity={0.5}
              adjustCamera={1.15}
              shadows={scene.shadows ? { type: 'contact', opacity: 0.55, blur: 2.5 } : false}
            >
              <Model url={model.url} wireframe={scene.wireframe} onReady={onReady} onPick={onPick} />
            </Stage>
          </Suspense>
        </ModelErrorBoundary>

        <OrbitControls makeDefault enableDamping autoRotate={rotate > 0} autoRotateSpeed={rotate} minDistance={1} maxDistance={30} />
        {debug && <Stats />}
      </Canvas>

      <div className="hud">
        <span className="pill" title={model.name}>📦 {model.name}</span>
        <button className="btn btn-small" onClick={() => fileInput.current?.click()}>Upload .glb</button>
      </div>

      {error && (
        <div className="toast" role="alert">
          {error}
          <button aria-label="Dismiss" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {dragging && <div className="dropzone">Drop your .glb to load it</div>}

      <input
        ref={fileInput}
        type="file"
        accept=".glb,model/gltf-binary"
        hidden
        onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }}
      />
    </div>
  );
}

class ModelErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) {
    console.error(err);
    this.props.onError?.("Couldn't read that file. Is it a valid .glb? Showing the default model instead.");
  }
  render() { return this.state.failed ? null : this.props.children; }
}
