import { useEffect, useState } from 'react';

/**
 * Decides whether this device should get the live 3D scene or the static poster.
 *
 * Signals (all optional; browsers that don't expose one are treated as capable):
 *  - prefers-reduced-motion: reduce          → static poster
 *  - Save-Data / data saver on               → static poster
 *  - navigator.deviceMemory <= 2 GB          → static poster (low-power)
 *  - navigator.hardwareConcurrency <= 2      → static poster (low-power)
 *  - no WebGL                                → static poster (can't render)
 *
 * URL overrides for testing: ?static forces the poster, ?3d forces the scene.
 */
function detect() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('3d')) return { allow3D: true, reason: null, canRender: true };

  const canRender = hasWebGL();
  if (!canRender) return { allow3D: false, reason: 'Your browser does not support WebGL.', canRender };
  if (params.has('static')) return { allow3D: false, reason: 'Static mode forced with ?static.', canRender };

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    return { allow3D: false, reason: 'You have reduced motion turned on, so we are showing a still image.', canRender };

  const conn = navigator.connection;
  if (conn?.saveData) return { allow3D: false, reason: 'Data saver is on, so we skipped the 3D download.', canRender };

  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  if ((mem && mem <= 2) || (cores && cores <= 2))
    return { allow3D: false, reason: 'This looks like a low-power device, so we are showing a still image.', canRender };

  return { allow3D: true, reason: null, canRender };
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function useCapabilities() {
  const [caps, setCaps] = useState(detect);

  // React live if the user flips their reduced-motion setting.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = () => setCaps(detect());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return caps;
}
