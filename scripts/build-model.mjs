/**
 * Generates the default model (a little toy robot) from three.js primitives,
 * writes an uncompressed GLB for comparison, then an optimized + meshopt-compressed
 * GLB that the app actually ships.
 *
 *   npm run build:model
 *
 * Swap in your own model instead with:
 *   npx @gltf-transform/cli optimize input.glb public/models/robot.glb --compress meshopt
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('public/models');
fs.mkdirSync(OUT_DIR, { recursive: true });

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('Robot');
const root = doc.createNode('Robot');
scene.addChild(root);

const mat = (name, hex, metallic, roughness) =>
  doc
    .createMaterial(name)
    .setBaseColorFactor([...new THREE.Color(hex).convertSRGBToLinear().toArray(), 1])
    .setMetallicFactor(metallic)
    .setRoughnessFactor(roughness);

const M = {
  Shell: mat('Shell', '#f4f1ea', 0.0, 0.45),
  Accent: mat('Accent', '#ff6b35', 0.1, 0.35),
  Visor: mat('Visor', '#1b2a41', 0.6, 0.15),
  Eyes: mat('Eyes', '#7cf5ff', 0.0, 0.2),
  Metal: mat('Metal', '#b8c0c8', 0.9, 0.32),
};
M.Eyes.setEmissiveFactor([0.3, 0.9, 1.0]);

function addPart(name, geometry, material, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const g = geometry.index ? geometry : mergeVertices(geometry);
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const idx = g.getIndex();

  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos.array)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor.array)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx.array)).setBuffer(buffer))
    .setMaterial(material);

  const mesh = doc.createMesh(name).addPrimitive(prim);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
  const node = doc.createNode(name).setMesh(mesh).setTranslation(position).setRotation(q.toArray()).setScale(scale);
  root.addChild(node);
}

// Body & head
addPart('Body', new THREE.CapsuleGeometry(0.55, 0.5, 12, 32), M.Shell, { position: [0, 0.95, 0] });
addPart('Belt', new THREE.TorusGeometry(0.56, 0.06, 16, 64), M.Accent, { position: [0, 0.8, 0], rotation: [Math.PI / 2, 0, 0] });
addPart('Head', new THREE.SphereGeometry(0.48, 48, 32), M.Shell, { position: [0, 1.9, 0], scale: [1.15, 0.9, 1] });
// Visor: a front-facing slice of a sphere slightly larger than the head.
addPart('Visor', new THREE.SphereGeometry(0.49, 48, 24, Math.PI / 2 - Math.PI / 2.6, Math.PI / 1.3, Math.PI / 3, Math.PI / 2.9), M.Visor, {
  position: [0, 1.9, 0], scale: [1.15, 0.9, 1.02],
});
addPart('EyeL', new THREE.SphereGeometry(0.065, 24, 16), M.Eyes, { position: [-0.16, 1.92, 0.5] });
addPart('EyeR', new THREE.SphereGeometry(0.065, 24, 16), M.Eyes, { position: [0.16, 1.92, 0.5] });

// Antenna
addPart('AntennaStem', new THREE.CylinderGeometry(0.02, 0.02, 0.35, 12), M.Metal, { position: [0, 2.45, 0] });
addPart('AntennaTip', new THREE.SphereGeometry(0.07, 24, 16), M.Accent, { position: [0, 2.65, 0] });

// Ears
for (const s of [-1, 1]) {
  addPart(s < 0 ? 'EarL' : 'EarR', new THREE.CylinderGeometry(0.12, 0.12, 0.1, 32), M.Accent, {
    position: [s * 0.55, 1.9, 0], rotation: [0, 0, Math.PI / 2],
  });
}

// Arms
for (const s of [-1, 1]) {
  const side = s < 0 ? 'L' : 'R';
  addPart(`Shoulder${side}`, new THREE.SphereGeometry(0.13, 24, 16), M.Metal, { position: [s * 0.62, 1.2, 0] });
  addPart(`Arm${side}`, new THREE.CapsuleGeometry(0.09, 0.45, 8, 16), M.Shell, {
    position: [s * 0.78, 0.92, 0], rotation: [0, 0, s * 0.35],
  });
  addPart(`Hand${side}`, new THREE.TorusGeometry(0.09, 0.035, 12, 24, Math.PI * 1.5), M.Accent, {
    position: [s * 0.9, 0.6, 0], rotation: [Math.PI / 2, 0, 0],
  });
}

// Base with wheels
addPart('Base', new THREE.CylinderGeometry(0.45, 0.55, 0.25, 48), M.Metal, { position: [0, 0.3, 0] });
for (const s of [-1, 1]) {
  addPart(s < 0 ? 'WheelL' : 'WheelR', new THREE.TorusGeometry(0.16, 0.07, 16, 32), M.Visor, {
    position: [s * 0.5, 0.18, 0], rotation: [0, Math.PI / 2, 0],
  });
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const rawPath = path.join(OUT_DIR, 'robot.raw.glb');
await io.write(rawPath, doc);

await doc.transform(dedup(), weld(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const outPath = path.join(OUT_DIR, 'robot.glb');
await io.write(outPath, doc);

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1) + ' KB';
console.log(`raw:        ${kb(rawPath)}`);
console.log(`compressed: ${kb(outPath)}  (meshopt + quantization)`);
// The raw file is only for the README comparison, never shipped.
fs.renameSync(rawPath, path.resolve('scripts/robot.raw.glb'));
