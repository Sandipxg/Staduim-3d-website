// Geometry helpers: sweep a cross-section around the bowl, merge parts, place instances.
import * as THREE from 'three';
import { TIERS, ROW_D, frameAt, standLen, type Frame } from '../../shared/layout';

export const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
export const lin = (h: string) => new THREE.Color(h).convertSRGBToLinear();
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export type Profile = [number, number][];
interface StripOpts { arc?: number; uScale?: number; vScale?: number }

/** Ribbon swept along the given stands with a (d, h) cross-section profile. UVs run in metres when scales are given. */
export function strip(ks: number[], profile: Profile, opts: StripOpts = {}): THREE.BufferGeometry {
  const arc = opts.arc ?? 20, uScale = opts.uScale ?? 1, vScale = opts.vScale ?? 0;
  const pos: number[] = [], uv: number[] = [];
  let total = 0;
  for (let j = 0; j < profile.length - 1; j++) total += Math.hypot(profile[j + 1][0] - profile[j][0], profile[j + 1][1] - profile[j][1]);
  let uAcc = 0;
  for (const k of ks) {
    const steps = k % 2 ? arc : 1, sl = standLen(k, profile[0][0]) / steps;
    for (let i = 0; i < steps; i++) {
      const u0 = i / steps, u1 = (i + 1) / steps;
      let vAcc = 0;
      for (let j = 0; j < profile.length - 1; j++) {
        const [d0, h0] = profile[j], [d1, h1] = profile[j + 1];
        const a = frameAt(k, u0, d0), b = frameAt(k, u1, d0), c = frameAt(k, u1, d1), e = frameAt(k, u0, d1);
        const pl = Math.hypot(d1 - d0, h1 - h0);
        const v0 = vScale ? vAcc / vScale : vAcc / total, v1 = vScale ? (vAcc + pl) / vScale : (vAcc + pl) / total;
        const ua = uAcc / uScale, ub = (uAcc + sl) / uScale;
        pos.push(a.x, h0, a.z, b.x, h0, b.z, c.x, h1, c.z, a.x, h0, a.z, c.x, h1, c.z, e.x, h1, e.z);
        uv.push(ua, v0, ub, v0, ub, v1, ua, v0, ub, v1, ua, v1);
        vAcc += pl;
      }
      uAcc += sl;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Stepped cross-section of all three tiers, concourses and the back wall. */
export function terraceProfile(): Profile {
  const P: Profile = [[0, 0], [0, TIERS[0].h0], [TIERS[0].d0, TIERS[0].h0]];
  let prevEnd: [number, number] = [0, 0];
  TIERS.forEach((t, ti) => {
    if (ti > 0) { P.push([t.d0, prevEnd[1]]); P.push([t.d0, t.h0]); }
    for (let r = 0; r < t.rows; r++) {
      const d = t.d0 + r * ROW_D, h = t.h0 + r * t.rise;
      P.push([d + ROW_D, h]);
      if (r < t.rows - 1) P.push([d + ROW_D, h + t.rise]);
    }
    prevEnd = P[P.length - 1];
  });
  const e = P[P.length - 1];
  P.push([e[0], 30.5], [42, 30.5]);
  return P;
}

export interface Part {
  geo?: THREE.BufferGeometry; w?: number; h?: number; d?: number;
  x?: number; y?: number; z?: number; rx?: number; ry?: number; s?: [number, number, number];
}
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  for (const p of parts) {
    let g = p.geo ? p.geo.clone() : new THREE.BoxGeometry(p.w, p.h, p.d);
    if (g.index) g = g.toNonIndexed();
    if (p.rx) g.rotateX(p.rx);
    if (p.ry) g.rotateY(p.ry);
    if (p.s) g.scale(p.s[0], p.s[1], p.s[2]);
    g.translate(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

const tmp = new THREE.Object3D();
export function instanced<T>(geo: THREE.BufferGeometry, mat: THREE.Material, list: T[], place: (o: THREE.Object3D, item: T, i: number) => void) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((it, i) => {
    tmp.position.set(0, 0, 0); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1);
    place(tmp, it, i); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix);
  });
  return m;
}

/** Evenly spaced frames along stand k at offset d. */
export function along(k: number, d: number, spacing: number): Frame[] {
  const L = standLen(k, d), n = Math.max(1, Math.round(L / spacing)), out: Frame[] = [];
  for (let i = 0; i < n; i++) out.push(frameAt(k, (i + 0.5) / n, d));
  return out;
}
