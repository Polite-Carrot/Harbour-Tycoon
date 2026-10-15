/// <reference types="node" />
/**
 * Writes the harbour's hero models as game-ready .glb files, built by the
 * same code the game draws them with (src/ui/port3d/models/).
 *
 *   npm run models:export              -> models-out/*.glb + manifest.json
 *   npm run models:export -- dolphin   -> just the ids listed
 *
 * Fails if a model breaks the spec: over its triangle budget, a file of
 * 2 MB or more, or a required moving part missing.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { MODELS, triangles } from '../src/ui/port3d/models';

// GLTFExporter reads Blobs through FileReader, which Node lacks.
if (!('FileReader' in globalThis)) {
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: ((e: { target: NodeFileReader }) => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then((r) => {
        this.result = r;
        this.onloadend?.({ target: this });
      });
    }
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then((r) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,` + Buffer.from(r).toString('base64');
        this.onloadend?.({ target: this });
      });
    }
  }
  (globalThis as Record<string, unknown>).FileReader = NodeFileReader;
}

const MAX_BYTES = 2 * 1024 * 1024;
const outDir = resolve(__dirname, '..', 'models-out');

async function main() {
  const only = process.argv.slice(2);
  const unknown = only.filter((id) => !MODELS.some((m) => m.id === id));
  if (unknown.length) throw new Error(`Unknown model id(s): ${unknown.join(', ')}`);
  const todo = only.length ? MODELS.filter((m) => only.includes(m.id)) : MODELS;

  await mkdir(outDir, { recursive: true });
  const exporter = new GLTFExporter();
  const manifest = [];
  let failed = false;

  for (const m of todo) {
    const g = m.build();
    const tris = triangles(g);
    const problems: string[] = [];
    for (const name of m.moving ?? []) if (!g.getObjectByName(name)) problems.push(`missing moving part "${name}"`);
    if (m.budget && tris > m.budget) problems.push(`${tris} triangles exceeds budget ${m.budget}`);

    const buf = Buffer.from((await exporter.parseAsync(g, { binary: true })) as ArrayBuffer);
    if (buf.byteLength >= MAX_BYTES) problems.push(`file is ${(buf.byteLength / 1024).toFixed(0)} KB (limit 2 MB)`);
    const file = `${m.id}.glb`;
    await writeFile(resolve(outDir, file), buf);

    const nodes: { name: string; parent: string | null; pivot: number[] }[] = [];
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) nodes.push({ name: o.name, parent: o.parent === g ? null : o.parent!.name, pivot: o.position.toArray() });
    });
    const box = new THREE.Box3().setFromObject(g);
    const r = (v: number) => +v.toFixed(3);
    manifest.push({
      id: m.id,
      label: m.label,
      file,
      root: g.name,
      triangles: tris,
      budget: m.budget,
      bytes: buf.byteLength,
      bounds: { min: box.min.toArray().map(r), max: box.max.toArray().map(r) },
      nodes,
      problems,
    });
    failed ||= problems.length > 0;
    const budget = m.budget ? ` / ${String(m.budget).padEnd(6)}` : '         ';
    const status = problems.length ? `FAIL ${problems.join('; ')}` : 'ok';
    console.log(`${m.label.padEnd(16)} ${String(tris).padStart(6)}${budget} tris  ${(buf.byteLength / 1024).toFixed(0).padStart(4)} KB  ${status}`);
  }

  if (!only.length) await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nWrote ${todo.length} model(s) to ${outDir}`);
  if (failed) {
    console.error('Some models do not meet the spec.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
