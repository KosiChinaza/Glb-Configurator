import { useEffect, useLayoutEffect, useState } from 'react';
import { invalidate } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

/**
 * Loads a GLB (meshopt + Draco decoding are handled by useGLTF), reports the
 * materials it finds, applies the wireframe toggle, and lets you tap a part
 * to select its material.
 */
export default function Model({ url, wireframe, onReady, onPick }) {
  const { scene } = useGLTF(url);
  const [hovered, setHovered] = useState(false);

  // Collect unique materials once per model and remember their original values.
  useLayoutEffect(() => {
    const seen = new Map();
    let i = 0;
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = obj.receiveShadow = true;
      for (const m of [].concat(obj.material)) {
        if (seen.has(m.uuid)) continue;
        let name = m.name || `Material ${++i}`;
        while ([...seen.values()].some((e) => e.name === name)) name += '′';
        m.userData.configName = name;
        m.userData.original ??= {
          color: m.color?.clone(),
          metalness: m.metalness,
          roughness: m.roughness,
          emissive: m.emissive?.clone(),
        };
        seen.set(m.uuid, { name, material: m, original: m.userData.original });
      }
    });
    onReady([...seen.values()]);
  }, [scene, onReady]);

  useEffect(() => {
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      for (const m of [].concat(obj.material)) m.wireframe = wireframe;
    });
    invalidate();
  }, [scene, wireframe]);

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => (document.body.style.cursor = '');
  }, [hovered]);

  const handleClick = (e) => {
    // Ignore the click that ends an orbit drag.
    if (e.delta > 6) return;
    e.stopPropagation();
    const m = [].concat(e.object.material)[0];
    if (!m) return;
    onPick(m.userData.configName);
    flash(m);
  };

  return (
    <primitive
      object={scene}
      onClick={handleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    />
  );
}

// Brief glow so you can see which material you just selected.
function flash(m) {
  if (!m.emissive) return;
  const base = m.userData.original?.emissive ?? m.emissive.clone();
  clearTimeout(m.userData.flashTimer);
  m.emissive.set('#3a3a3a').add(base);
  invalidate();
  m.userData.flashTimer = setTimeout(() => {
    m.emissive.copy(base);
    invalidate();
  }, 280);
}
