import { Suspense } from 'react';
import { Environment, Lightformer } from '@react-three/drei';

/**
 * "studio" is built from a few Lightformers rendered into a small cube map:
 * zero network requests, so the default view never waits on an HDRI download.
 * The other presets stream an HDRI (~1–2 MB) from the drei-assets CDN only when
 * you pick them; the studio env stays visible while they load.
 */
export default function Lighting({ preset }) {
  return (
    <Suspense fallback={<StudioEnv />}>
      {preset === 'studio' ? <StudioEnv /> : <Environment preset={preset} />}
    </Suspense>
  );
}

function StudioEnv() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer intensity={2} position={[0, 5, -2]} scale={[10, 5, 1]} rotation-x={Math.PI / 2} />
      <Lightformer intensity={3} position={[-5, 1, 1]} scale={[3, 6, 1]} rotation-y={Math.PI / 2} />
      <Lightformer intensity={1.5} position={[5, 2, 2]} scale={[3, 4, 1]} rotation-y={-Math.PI / 2} />
      <Lightformer intensity={1} position={[0, 1, 6]} scale={[8, 2, 1]} color="#ffe8d6" />
      <Lightformer form="ring" intensity={4} position={[2, 3, -4]} scale={1.5} color="#ffffff" />
    </Environment>
  );
}
