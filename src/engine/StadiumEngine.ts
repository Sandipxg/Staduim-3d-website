// The 3D stadium: scene building, lighting, camera flights, picking and seat highlighting.
// React owns the UI; this module owns everything inside the <canvas>.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import {
  A, B, R0, SEAT_W, TIERS, STANDS, frameAt, standLen, tierFloor, mulberry32, type Layout, type Frame,
} from '../../shared/layout';
import { ALL, lin, ease, smooth, strip, terraceProfile, mergeParts, instanced, along } from './geometry';
import { createTextures } from './textures';
import { rupee } from '../lib/format';

export type Mode = 0 | 1 | 2 | 3; // overview, stand, block, seat view
export interface EngineState { mode: Mode; stand: number; block: number; seat: number }
export interface TipInfo { x: number; y: number; eyebrow: string; title: string; sub: string; price: string; priceLabel: string; warn?: boolean }
export interface EngineCallbacks {
  onState: (s: EngineState) => void;
  onBusy: (busy: boolean) => void;
  onTip: (t: TipInfo | null) => void;
  onFlash: (msg: string) => void;
}
type Progress = (label: string, fraction: number) => void;

const DAY_ELEV = 15, NIGHT_ELEV = -9, SUN_AZ = 232;
const SKY = { turbidity: 6.5, rayleigh: 1.6, mieCoefficient: 0.006, mieDirectionalG: 0.82 };
const UNI_DECL = 'uniform float uMode,uHoverStand,uActiveStand,uHoverBlock,uActiveBlock,uHoverSeat,uSelSeat; uniform vec3 uHi,uYours;';
const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

export class StadiumEngine {
  private readonly layout: Layout;
  private readonly cb: EngineCallbacks;
  private readonly canvas: HTMLCanvasElement;
  private readonly coarse = matchMedia('(pointer: coarse)').matches;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly rand = mulberry32(7331);

  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private sky = new Sky();
  private sun = new THREE.DirectionalLight();
  private hemi = new THREE.HemisphereLight();
  private flood = new THREE.DirectionalLight();
  private flood2 = new THREE.DirectionalLight();
  private pmrem!: THREE.PMREMGenerator;
  private envDay: THREE.Texture | null = null;
  private envNight: THREE.Texture | null = null;
  private M!: ReturnType<StadiumEngine['createMaterials']>;
  private tex!: ReturnType<typeof createTextures>;
  private terraces: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private statusAttr!: THREE.InstancedBufferAttribute;
  private roofGlow?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private lampGlow?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private stars?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  private readonly U = {
    uMode: { value: 0 }, uHoverStand: { value: -1 }, uActiveStand: { value: -1 }, uHoverBlock: { value: -1 }, uActiveBlock: { value: -1 },
    uHoverSeat: { value: -1 }, uSelSeat: { value: -1 }, uHi: { value: lin('#ff7a1a') }, uYours: { value: lin('#2fd3bf') },
  };
  private statuses: Uint8Array;

  private mode: Mode = 0;
  private curStand = -1; private curBlock = -1; private curSeat = -1;
  private tween: null | { t: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; ctrl: THREE.Vector3; l0: THREE.Vector3; l1: THREE.Vector3; f0: number; f1: number; done?: () => void } = null;
  private savedOverview: THREE.Vector3 | null = null;
  private userTouched = false;
  private envK = 0; private envTarget = 0;
  private shadowDirty = true;
  private last = performance.now();
  private raf = 0;
  private running = false;
  private mouse = { x: 0, y: 0, in: false, dirty: false };
  private down: { x: number; y: number } | null = null;
  private idleT = 0;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pv = new THREE.Vector3();
  private disposers: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, layout: Layout, cb: EngineCallbacks) {
    this.canvas = canvas; this.layout = layout; this.cb = cb;
    this.statuses = Uint8Array.from(layout.seats, s => s.initial);
  }

  /* ---------- public API ---------- */
  async init(onProgress: Progress) {
    this.setupRenderer();
    const steps: [string, () => void][] = [
      ['Pouring the concrete', () => this.buildGround()],
      ['Raising the stands', () => this.buildBowl()],
      [`Bolting in ${this.layout.seats.length.toLocaleString('en-IN')} seats`, () => this.buildSeats()],
      ['Planting the park', () => this.buildSurroundings()],
    ];
    for (let i = 0; i < steps.length; i++) {
      onProgress(steps[i][0], i / (steps.length + 1));
      await nextFrame();
      steps[i][1]();
    }
    onProgress('Turning on the lights', steps.length / (steps.length + 1));
    await nextFrame();
    this.envDay = this.envFor(DAY_ELEV, false);
    this.envNight = this.envFor(NIGHT_ELEV, true);
    this.applyEnv(0);
    this.camera.position.set(0, 620, 520); this.controls.target.set(0, 0, 0); this.camera.lookAt(0, 0, 0);
    this.renderer.compile(this.scene, this.camera);
    await nextFrame();
    onProgress('Ready', 1);
    this.bindEvents();
    this.running = true;
    this.raf = requestAnimationFrame(this.loop);
    this.cb.onState(this.state());
  }

  intro() {
    this.flyTo(this.overviewPose(), new THREE.Vector3(0, 0, 0), { dur: 2.6, lift: 40 }, () => this.configureControls(0));
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.disposers.forEach(d => d());
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  get isFlying() { return this.tween !== null; }

  /** Replace seat statuses (0 open, 1 booked, 2 yours). */
  setStatuses(next: Uint8Array) {
    if (next.length !== this.statuses.length) return;
    this.statuses.set(next);
    const arr = this.statusAttr?.array as Float32Array | undefined;
    if (arr) { for (let i = 0; i < next.length; i++) arr[i] = next[i]; this.statusAttr.needsUpdate = true; }
  }
  setNight(night: boolean) { this.envTarget = night ? 1 : 0; }
  previewStand(k: number) {
    if (this.mode !== 0) return;
    this.U.uHoverStand.value = k;
    this.terraces.forEach((t, i) => (t.material.emissiveIntensity = i === k ? 0.1 : 0));
  }
  previewBlock(id: number) { if (this.mode === 1) this.U.uHoverBlock.value = id; }

  goOverview() {
    this.mode = 0; this.curStand = this.curBlock = this.curSeat = -1;
    const U = this.U;
    U.uMode.value = 0; U.uHoverStand.value = -1; U.uActiveStand.value = -1; U.uHoverBlock.value = -1; U.uActiveBlock.value = -1; U.uHoverSeat.value = -1; U.uSelSeat.value = -1;
    this.cb.onState(this.state());
    this.flyTo(this.savedOverview ?? this.overviewPose(), new THREE.Vector3(0, 0, 0), { dur: 1.9, fov: 45 }, () => this.configureControls(0));
  }
  goStand(k: number) {
    if (this.mode === 0) this.savedOverview = this.camera.position.clone();
    this.mode = 1; this.curStand = k; this.curBlock = this.curSeat = -1;
    const U = this.U;
    U.uMode.value = 1; U.uActiveStand.value = k; U.uHoverStand.value = -1; U.uHoverBlock.value = -1; U.uSelSeat.value = -1;
    this.terraces.forEach(t => (t.material.emissiveIntensity = 0));
    this.cb.onState(this.state());
    const f = frameAt(k, 0.5, 20), s = this.aspectBoost() * (k % 2 ? 0.9 : 1);
    const look = new THREE.Vector3(f.x, 12, f.z);
    const pos = new THREE.Vector3(f.x - f.nx * 82 * s, 44 * s, f.z - f.nz * 82 * s);
    this.flyTo(pos, look, { dur: 1.9, fov: 45 }, () => this.configureControls(1));
  }
  goBlock(id: number) {
    const b = this.layout.blocks[id];
    if (this.mode === 0) this.savedOverview = this.camera.position.clone();
    this.mode = 2; this.curStand = b.stand; this.curBlock = id; this.curSeat = -1;
    const U = this.U;
    U.uMode.value = 2; U.uActiveStand.value = b.stand; U.uActiveBlock.value = id; U.uHoverSeat.value = -1; U.uSelSeat.value = -1; U.uHoverBlock.value = -1;
    this.cb.onState(this.state());
    const s = this.aspectBoost(), c = new THREE.Vector3(...b.c);
    const pos = new THREE.Vector3(c.x - b.n[0] * 24 * s, c.y + 11 * s, c.z - b.n[1] * 24 * s);
    this.flyTo(pos, c, { dur: 1.6, fov: 45 }, () => this.configureControls(2));
  }
  goSeat(i: number) {
    const st = this.layout.seats[i];
    this.mode = 3; this.curSeat = i; this.curBlock = st.block; this.curStand = st.stand;
    this.U.uMode.value = 3; this.U.uSelSeat.value = -1; this.U.uHoverSeat.value = -1;
    this.cb.onState(this.state());
    const eye = new THREE.Vector3(st.x + st.nx * 0.16, st.y + 1.28, st.z + st.nz * 0.16);
    const look = new THREE.Vector3(st.x * 0.06, 0, st.z * 0.06);
    this.flyTo(eye, look, { dur: 2.1, fov: 60, lift: 6 }, () => this.configureControls(3, look));
  }
  back() {
    if (this.tween) return;
    if (this.mode === 3) this.goBlock(this.curBlock);
    else if (this.mode === 2) this.goStand(this.curStand);
    else if (this.mode === 1) this.goOverview();
  }
  bestSeat(blockId: number): number {
    const b = this.layout.blocks[blockId];
    let best = -1, score = 1e9;
    b.rowSeats.forEach((row, r) => {
      const mid = (row.length - 1) / 2, idealRow = b.tier === 0 ? 6 : b.tier === 1 ? 3 : 4;
      row.forEach((i, p) => { if (this.statuses[i] !== 0) return; const sc = Math.abs(p - mid) + Math.abs(r - idealRow) * 1.6; if (sc < score) { score = sc; best = i; } });
    });
    return best;
  }

  /* ---------- setup ---------- */
  private setupRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, this.coarse ? 1.5 : 2));
    r.setSize(innerWidth, innerHeight, false);
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.6;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    this.renderer = r;
    this.pmrem = new THREE.PMREMGenerator(r);
    this.tex = createTextures(r.capabilities.getMaxAnisotropy());
    this.M = this.createMaterials();

    const scene = this.scene;
    scene.fog = new THREE.Fog(lin('#d9cdb8'), 420, 1900);
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.25, 9000);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08; this.controls.enablePan = false; this.controls.enabled = false;

    this.sky.scale.setScalar(6000); scene.add(this.sky);
    this.skyParams(this.sky, DAY_ELEV);
    this.hemi.color.copy(lin('#cfe0ff')); this.hemi.groundColor.copy(lin('#5d6a44')); this.hemi.intensity = 0.25; scene.add(this.hemi);
    const sun = this.sun;
    sun.color.copy(lin('#ffdcae')); sun.intensity = 3.4; sun.castShadow = true;
    const sm = this.coarse ? 2048 : 4096; sun.shadow.mapSize.set(sm, sm);
    Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 20, far: 900 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.3;
    scene.add(sun, sun.target);
    this.flood.color.copy(lin('#eef3ff')); this.flood.intensity = 0; this.flood.position.set(20, 300, 30);
    this.flood2.color.copy(lin('#eef3ff')); this.flood2.intensity = 0; this.flood2.position.set(-60, 180, -80);
    scene.add(this.flood, this.flood2);
  }

  private createMaterials() {
    const t = this.tex, W = new THREE.Color(1, 1, 1);
    return {
      concrete: new THREE.MeshStandardMaterial({ map: t.concrete, color: lin('#ffffff'), roughness: 0.93, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
      roofPanel: new THREE.MeshStandardMaterial({ color: lin('#eef2f2'), roughness: 0.35, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.8 }),
      steel: new THREE.MeshStandardMaterial({ color: lin('#f1f1ee'), roughness: 0.45, metalness: 0.35, envMapIntensity: 0.9 }),
      steelDark: new THREE.MeshStandardMaterial({ color: lin('#7d868d'), roughness: 0.45, metalness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: lin('#2c3a44'), roughness: 0.08, metalness: 0.85, envMapIntensity: 1.2, emissive: lin('#ffb36b'), emissiveIntensity: 0, side: THREE.DoubleSide }),
      fin: new THREE.MeshStandardMaterial({ color: lin('#f3f2ec'), roughness: 0.5, metalness: 0.1 }),
      balustrade: new THREE.MeshStandardMaterial({ color: lin('#cfe2ea'), roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 }),
      dark: new THREE.MeshStandardMaterial({ color: lin('#14181c'), roughness: 0.9 }),
      plaza: new THREE.MeshStandardMaterial({ map: t.pave, roughness: 0.92, envMapIntensity: 0.5 }),
      road: new THREE.MeshStandardMaterial({ map: t.road, roughness: 0.85, envMapIntensity: 0.4 }),
      white: new THREE.MeshStandardMaterial({ color: lin('#ffffff'), roughness: 0.4 }),
      yellow: new THREE.MeshStandardMaterial({ color: lin('#f2c230'), roughness: 0.6 }),
      ads: new THREE.MeshStandardMaterial({ map: t.ads, emissive: W, emissiveMap: t.ads, emissiveIntensity: 0.5, roughness: 0.4, side: THREE.DoubleSide }),
      board: new THREE.MeshStandardMaterial({ map: t.board, emissive: W, emissiveMap: t.board, emissiveIntensity: 1.1, roughness: 0.4 }),
      lights: new THREE.MeshStandardMaterial({ color: lin('#d9dde0'), emissive: lin('#fff6e2'), emissiveIntensity: 0.05, roughness: 0.3, metalness: 0.5 }),
      city: new THREE.MeshStandardMaterial({ map: t.winDay, emissive: W, emissiveMap: t.winNight, emissiveIntensity: 0, roughness: 0.6, metalness: 0.2 }),
    };
  }

  private skyParams(target: Sky, elev: number) {
    const u = target.material.uniforms;
    u.turbidity.value = SKY.turbidity; u.rayleigh.value = SKY.rayleigh; u.mieCoefficient.value = SKY.mieCoefficient; u.mieDirectionalG.value = SKY.mieDirectionalG;
    (u.sunPosition.value as THREE.Vector3).setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(SUN_AZ));
  }
  private envFor(elev: number, nightGlow: boolean) {
    const s = new THREE.Scene(), sk = new Sky(); sk.scale.setScalar(50); this.skyParams(sk, elev); s.add(sk);
    if (nightGlow) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(30, 4, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.7) }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 14; s.add(ring);
    }
    return this.pmrem.fromScene(s, 0.02, 0.1, 100).texture;
  }
  private placeSun(elev: number) {
    const v = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Math.max(elev, 4)), THREE.MathUtils.degToRad(SUN_AZ));
    this.sun.position.copy(v).multiplyScalar(420);
  }

  /* ---------- builders ---------- */
  private buildGround() {
    const { scene, M, tex, rand } = this;
    const gg = new THREE.PlaneGeometry(3600, 3600, 120, 120), col: number[] = [], p = gg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const v = 0.82 + 0.12 * Math.sin(x * 0.011 + Math.sin(y * 0.007) * 2) + 0.08 * Math.sin(y * 0.019 + x * 0.004) + (rand() - 0.5) * 0.06;
      const c = lin('#ffffff').multiplyScalar(v); col.push(c.r * 0.98, c.g, c.b * 0.92);
    }
    gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: tex.grass, vertexColors: true, roughness: 1, envMapIntensity: 0.4 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const surround = new THREE.Mesh(new THREE.PlaneGeometry(2 * A + 4, 2 * B + 4), new THREE.MeshStandardMaterial({ color: lin('#356f30'), roughness: 1 }));
    surround.rotation.x = -Math.PI / 2; surround.position.y = 0.02; surround.receiveShadow = true; scene.add(surround);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(105, 68), new THREE.MeshStandardMaterial({ map: tex.pitch, roughness: 0.9, envMapIntensity: 0.35 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.04; pitch.receiveShadow = true; scene.add(pitch);

    const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, wireframe: true });
    for (const s of [-1, 1]) {
      const g = new THREE.Group(), post = new THREE.CylinderGeometry(0.06, 0.06, 2.44, 10);
      for (const z of [-3.66, 3.66]) { const pm = new THREE.Mesh(post, M.white); pm.position.set(0, 1.22, z); pm.castShadow = true; g.add(pm); }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.44, 10), M.white); bar.rotation.x = Math.PI / 2; bar.position.set(0, 2.44, 0); bar.castShadow = true; g.add(bar);
      const net = new THREE.Mesh(new THREE.BoxGeometry(2, 2.44, 7.32, 8, 10, 30), netMat); net.position.set(s * 1, 1.22, 0); g.add(net);
      g.position.set(s * 52.5, 0.04, 0); scene.add(g);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), M.yellow); f.position.set(sx * 52.5, 0.8, sz * 34); scene.add(f);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshStandardMaterial({ color: lin('#ff7a1a'), side: THREE.DoubleSide })); fl.position.set(sx * 52.5 + 0.2, 1.4, sz * 34); scene.add(fl);
    }
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 2.4), M.dark); base.position.y = 0.15; g.add(base);
      const backW = new THREE.Mesh(new THREE.BoxGeometry(12, 2.2, 0.1), M.dark); backW.position.set(0, 1.1, -1.15); g.add(backW);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 12, 16, 1, true, Math.PI, Math.PI / 2), M.balustrade); roof.rotation.z = Math.PI / 2; roof.position.set(0, 1.0, -0.1); g.add(roof);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: lin('#1f3f8f') })); bench.position.set(0, 0.5, -0.7); g.add(bench);
      g.position.set(s * 9, 0.02, -37.6);
      g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(g);
    }
    const plaza = new THREE.Mesh(strip(ALL, [[42, 0.05], [76, 0.05]], { arc: 24, uScale: 14, vScale: 14 }), M.plaza); plaza.receiveShadow = true; scene.add(plaza);
    const road = new THREE.Mesh(strip(ALL, [[95, 0.06], [109, 0.06]], { arc: 24, uScale: 40 }), M.road); road.receiveShadow = true; scene.add(road);
    scene.add(new THREE.Mesh(strip(ALL, [[76, 0.05], [76, 0.22], [76.6, 0.22], [76.6, 0.05]], { arc: 24 }), M.concrete));
    for (const s of [-1, 1]) {
      const rt = tex.road.clone(); rt.needsUpdate = true; rt.wrapS = THREE.RepeatWrapping; rt.repeat.set(30, 1);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(1200, 14), new THREE.MeshStandardMaterial({ map: rt, roughness: 0.85 })); r.rotation.x = -Math.PI / 2; r.position.set(s * (A + 102 + 600), 0.06, 0); r.receiveShadow = true; scene.add(r);
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(190, 74), new THREE.MeshStandardMaterial({ map: tex.lot, roughness: 0.9 })); lot.rotation.x = -Math.PI / 2; lot.position.set(0, 0.07, s * (B + 109 + 50)); lot.receiveShadow = true; scene.add(lot);
      const drive = new THREE.Mesh(new THREE.PlaneGeometry(12, 16), M.road); drive.rotation.x = -Math.PI / 2; drive.position.set(0, 0.065, s * (B + 109 + 6)); scene.add(drive);
    }
  }

  private buildBowl() {
    const { scene, M, tex, layout } = this;
    const prof = terraceProfile();
    STANDS.forEach((_, k) => {
      const mat = M.concrete.clone(); mat.emissive = lin('#ff7a1a'); mat.emissiveIntensity = 0;
      const t = new THREE.Mesh(strip([k], prof, { arc: 22, uScale: 6, vScale: 6 }), mat);
      t.castShadow = true; t.receiveShadow = true; t.userData.stand = k; scene.add(t); this.terraces.push(t);
    });
    for (const t of [1, 2]) {
      const tr = TIERS[t];
      scene.add(new THREE.Mesh(strip(ALL, [[tr.d0 - 0.05, tr.h0], [tr.d0 - 0.05, tr.h0 + 1.05]], { arc: 24 }), M.balustrade));
      scene.add(new THREE.Mesh(strip(ALL, [[tr.d0 - 0.12, tr.h0 + 1.05], [tr.d0 + 0.02, tr.h0 + 1.05], [tr.d0 + 0.02, tr.h0 + 1.11], [tr.d0 - 0.12, tr.h0 + 1.11]], { arc: 24 }), M.steelDark));
      scene.add(new THREE.Mesh(strip(ALL, [[tr.d0 - 0.02, tr.h0 - 1.25], [tr.d0 - 0.02, tr.h0 - 0.2]], { arc: 24, uScale: 90 }), M.ads));
    }
    scene.add(new THREE.Mesh(strip(ALL, [[-0.05, 1.2], [-0.05, 2.1]], { arc: 24 }), M.balustrade));
    scene.add(new THREE.Mesh(strip(ALL, [[-3.4, 0.04], [-3.4, 0.98]], { arc: 16, uScale: 70 }), M.ads));
    scene.add(new THREE.Mesh(strip(ALL, [[-3.4, 0.98], [-3.1, 0.98], [-3.1, 0.04]], { arc: 16 }), M.dark));

    // aisle stair nosings
    const nos: { f: Frame; y: number }[] = [];
    STANDS.forEach((st, k) => TIERS.forEach(tr => {
      for (let j = 0; j <= st.cols; j++) {
        if (j === st.cols && k % 2 === 1) continue;
        for (let r = 0; r < tr.rows; r++) {
          const d = tr.d0 + r * 0.85 + 0.03, L = standLen(k, d);
          nos.push({ f: frameAt(k, (j * L / st.cols) / L, d), y: tr.h0 + r * tr.rise + 0.012 });
        }
      }
    }));
    scene.add(instanced(new THREE.BoxGeometry(1.1, 0.025, 0.07), M.yellow, nos, (o, it) => { o.position.set(it.f.x, it.y, it.f.z); o.rotation.y = Math.atan2(it.f.nx, it.f.nz); }));
    // aisle handrails
    const rails: { f: Frame; y: number; len: number; slope: number }[] = [];
    STANDS.forEach((st, k) => TIERS.forEach(tr => {
      for (let j = 1; j < st.cols; j++) {
        const dm = tr.d0 + tr.rows * 0.85 / 2;
        rails.push({ f: frameAt(k, j / st.cols, dm), y: tr.h0 + (tr.rows / 2) * tr.rise + 0.9, len: tr.rows * 0.85, slope: Math.atan2(tr.rise, 0.85) });
      }
    }));
    scene.add(instanced(new THREE.BoxGeometry(0.05, 0.05, 1), M.steelDark, rails, (o, it) => {
      o.position.set(it.f.x, it.y, it.f.z); o.rotation.order = 'YXZ'; o.rotation.y = Math.atan2(it.f.nx, it.f.nz); o.rotation.x = -it.slope; o.scale.set(1, 1, it.len / Math.cos(it.slope));
    }));
    // vomitories
    const vom: { f: Frame; y: number }[] = [];
    for (const b of layout.blocks) {
      if (b.tier === 0) continue;
      vom.push({ f: frameAt(b.stand, (b.col + 0.5) / STANDS[b.stand].cols, TIERS[b.tier].d0 - 0.15), y: tierFloor(b.tier) + 1.15 });
    }
    scene.add(instanced(new THREE.BoxGeometry(2.6, 2.3, 0.35), M.dark, vom, (o, it) => { o.position.set(it.f.x, it.y, it.f.z); o.rotation.y = Math.atan2(it.f.nx, it.f.nz); }));

    // facade
    const facade = new THREE.Mesh(strip(ALL, [[42, 0], [42, 40]], { arc: 28 }), M.glass); facade.receiveShadow = true; scene.add(facade);
    const fins: Frame[] = []; ALL.forEach(k => fins.push(...along(k, 42.5, 3.6)));
    const finMesh = instanced(new THREE.BoxGeometry(0.35, 40, 1.0), M.fin, fins, (o, f) => { o.position.set(f.x, 20, f.z); o.rotation.y = Math.atan2(f.nx, f.nz); });
    finMesh.castShadow = true; finMesh.receiveShadow = true; scene.add(finMesh);
    for (const h of [6.5, 13.5, 20.5, 27.5, 34.5]) {
      const s = new THREE.Mesh(strip(ALL, [[41.8, h], [43.3, h], [43.3, h + 0.55], [41.8, h + 0.55]], { arc: 28 }), M.fin); s.receiveShadow = true; scene.add(s);
    }
    STANDS.forEach((st, k) => {
      const f = frameAt(k, 0.5, 43.2), ry = Math.atan2(f.nx, f.nz);
      const door = new THREE.Mesh(new THREE.BoxGeometry(12, 5.6, 0.6), M.dark); door.position.set(f.x, 2.8, f.z); door.rotation.y = ry; scene.add(door);
      const map = tex.sign(st.gate);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ map, emissive: new THREE.Color(1, 1, 1), emissiveMap: map, emissiveIntensity: 0.6 }));
      sg.position.set(f.x + f.nx * 0.35, 7.4, f.z + f.nz * 0.35); sg.rotation.y = ry; scene.add(sg);
    });

    // roof
    const panels = new THREE.Mesh(strip(ALL, [[29.5, 37.6], [48.5, 40.2]], { arc: 28 }), M.roofPanel); panels.castShadow = true; panels.renderOrder = 2; scene.add(panels);
    const rim = new THREE.Mesh(strip(ALL, [[44, 39.6], [48.8, 40.25], [48.8, 38.2], [44, 38.2], [44, 39.6]], { arc: 28 }), M.steel); rim.castShadow = true; rim.receiveShadow = true; scene.add(rim);
    const catwalk = new THREE.Mesh(strip(ALL, [[29.1, 37.2], [30.6, 37.2], [30.6, 38.0], [29.1, 38.0], [29.1, 37.2]], { arc: 28 }), M.steel); catwalk.castShadow = true; scene.add(catwalk);
    scene.add(new THREE.Mesh(strip(ALL, [[29.4, 36.95], [30.4, 36.95]], { arc: 28 }), M.lights));
    const trusses: Frame[] = []; ALL.forEach(k => trusses.push(...along(k, 39, 6.2)));
    const slope = Math.atan2(40.2 - 37.6, 48.5 - 29.5);
    const truss = instanced(mergeParts([{ w: 0.35, h: 0.35, d: 19.4 }, { w: 0.25, h: 0.25, d: 19.4, y: -1.5 }, { w: 0.18, h: 1.5, d: 0.18, y: -0.75, z: -6 }, { w: 0.18, h: 1.5, d: 0.18, y: -0.75 }, { w: 0.18, h: 1.5, d: 0.18, y: -0.75, z: 6 }]), M.steel, trusses,
      (o, f) => { o.position.set(f.x, 38.75, f.z); o.rotation.order = 'YXZ'; o.rotation.y = Math.atan2(f.nx, f.nz); o.rotation.x = -slope; });
    truss.castShadow = true; scene.add(truss);
    const gl: number[] = []; ALL.forEach(k => along(k, 29.9, 4.5).forEach(f => gl.push(f.x, 36.7, f.z)));
    const glowGeo = new THREE.BufferGeometry(); glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3));
    this.roofGlow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: tex.glow, size: 14, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff3dc, fog: false }));
    scene.add(this.roofGlow);

    for (const k of [2, 6]) {
      const f = frameAt(k, 0.5, 31.5);
      const scr = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 0.8), [M.dark, M.dark, M.dark, M.dark, M.board, M.dark]);
      scr.position.set(f.x, 31.5, f.z); scr.rotation.y = Math.atan2(-f.nx, -f.nz); scr.castShadow = true; scene.add(scr);
      for (const o of [-9, 9]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.8, 0.15), M.steelDark); c.position.set(f.x + (-f.nz) * o, 36.9, f.z + f.nx * o); scene.add(c); }
    }
  }

  private buildSeats() {
    const { layout, U, rand } = this, N = layout.seats.length;
    const parts = [
      { w: 0.44, h: 0.06, d: 0.40, y: 0.42, z: -0.02, rx: -0.08 },
      { w: 0.44, h: 0.42, d: 0.05, y: 0.66, z: 0.2, rx: 0.17 },
      ...(this.coarse ? [] : [{ w: 0.06, h: 0.4, d: 0.06, y: 0.2, z: 0.08 }]),
    ];
    const geo = mergeParts(parts);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0, envMapIntensity: 0.7 });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aStand; attribute float aBlock; attribute float aSeat; attribute float aStatus;\nvarying float vStand; varying float vBlock; varying float vSeat; varying float vStatus;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStand=aStand; vBlock=aBlock; vSeat=aSeat; vStatus=aStatus;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + UNI_DECL + '\nvarying float vStand; varying float vBlock; varying float vSeat; varying float vStatus;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float yours = step(1.5, vStatus);
          float taken = step(0.5, vStatus) * (1.0 - yours);
          vec3 c = mix(vec3(0.82, 0.84, 0.86), vec3(0.62, 0.035, 0.03), taken) * diffuseColor.rgb;
          if (uMode < 0.5) {
            float hs = 1.0 - step(0.5, abs(vStand - uHoverStand));
            c = mix(c, uHi, hs * 0.8); totalEmissiveRadiance += uHi * hs * 0.22;
          } else if (uMode < 1.5) {
            float act = 1.0 - step(0.5, abs(vStand - uActiveStand));
            float hb = 1.0 - step(0.5, abs(vBlock - uHoverBlock));
            c = mix(c * 0.45, c, act); c = mix(c, uHi, hb * 0.85); totalEmissiveRadiance += uHi * hb * 0.25;
          } else if (uMode < 2.5) {
            float inb = 1.0 - step(0.5, abs(vBlock - uActiveBlock));
            float hv = (1.0 - step(0.5, abs(vSeat - uHoverSeat))) * (1.0 - taken) * (1.0 - yours);
            vec3 b = mix(c, uHi, hv);
            totalEmissiveRadiance += (uHi * hv + vec3(0.05) * (1.0 - taken)) * inb;
            c = mix(c * 0.45, b, inb);
          }
          float sel = max(yours, 1.0 - step(0.5, abs(vSeat - uSelSeat)));
          c = mix(c, uYours, sel); totalEmissiveRadiance += uYours * sel * 0.5;
          diffuseColor.rgb = c;`);
    };
    const aStand = new Float32Array(N), aBlock = new Float32Array(N), aSeat = new Float32Array(N), aStatus = new Float32Array(N);
    const mesh = new THREE.InstancedMesh(geo, mat, N), o = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const s = layout.seats[i];
      o.position.set(s.x, s.y, s.z); o.rotation.set(0, Math.atan2(s.nx, s.nz), 0); o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.setRGB(1, 1, 1).multiplyScalar(0.92 + rand() * 0.08));
      aStand[i] = s.stand; aBlock[i] = s.block; aSeat[i] = i; aStatus[i] = this.statuses[i];
    }
    geo.setAttribute('aStand', new THREE.InstancedBufferAttribute(aStand, 1));
    geo.setAttribute('aBlock', new THREE.InstancedBufferAttribute(aBlock, 1));
    geo.setAttribute('aSeat', new THREE.InstancedBufferAttribute(aSeat, 1));
    this.statusAttr = new THREE.InstancedBufferAttribute(aStatus, 1);
    geo.setAttribute('aStatus', this.statusAttr);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private offsetOf(x: number, z: number) {
    const dx = Math.max(Math.abs(x) - (A - R0), 0), dz = Math.max(Math.abs(z) - (B - R0), 0);
    if (dx === 0) return Math.abs(z) - B;
    if (dz === 0) return Math.abs(x) - A;
    return Math.hypot(dx, dz) - R0;
  }

  private buildSurroundings() {
    const { scene, M, tex, rand, coarse } = this;
    const trees: [number, number, number, boolean][] = [], lotZ = B + 109 + 50;
    let tries = 0;
    while (trees.length < (coarse ? 800 : 1500) && tries < 30000) {
      tries++;
      const x = (rand() * 2 - 1) * 620, z = (rand() * 2 - 1) * 620, off = this.offsetOf(x, z);
      if (off < 82 || (off > 91 && off < 116) || Math.hypot(x, z) > 620) continue;
      if (Math.abs(z) < 15 && Math.abs(x) > A + 100) continue;
      if (Math.abs(x) < 102 && Math.abs(Math.abs(z) - lotZ) < 44) continue;
      if (Math.abs(x) < 10 && Math.abs(z) < lotZ) continue;
      trees.push([x, z, 2.6 + rand() * 2.6, rand() < 0.22]);
    }
    const ico = new THREE.IcosahedronGeometry(1, 1);
    const leafy = mergeParts([{ geo: ico }, { geo: ico, x: 0.65, y: -0.25, z: 0.2, s: [0.75, 0.75, 0.75] }, { geo: ico, x: -0.55, y: -0.15, z: -0.35, s: [0.7, 0.7, 0.7] }, { geo: ico, y: 0.55, z: 0.1, s: [0.7, 0.7, 0.7] }]);
    const cone = mergeParts([{ geo: new THREE.ConeGeometry(0.9, 1.6, 8) }, { geo: new THREE.ConeGeometry(0.7, 1.3, 8), y: 0.8 }, { geo: new THREE.ConeGeometry(0.45, 1.0, 8), y: 1.5 }]);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true, envMapIntensity: 0.35 });
    const greens = ['#2e5424', '#3a6529', '#46732f', '#294a20', '#557f37', '#62843a'].map(lin), pines = ['#21402a', '#2b4d30', '#1d3a26'].map(lin), cc = new THREE.Color();
    const dec = trees.filter(t => !t[3]), con = trees.filter(t => t[3]);
    scene.add(instanced(new THREE.CylinderGeometry(0.22, 0.35, 1, 6), new THREE.MeshStandardMaterial({ color: lin('#5a4633') }), trees, (o, [x, z, r]) => { o.position.set(x, r * 0.55, z); o.scale.set(r * 0.5, r * 1.1, r * 0.5); }));
    const dm = instanced(leafy, crownMat, dec, (o, [x, z, r]) => { o.position.set(x, r * 1.35, z); o.rotation.y = rand() * 6; const s = r * (0.9 + rand() * 0.3); o.scale.set(s, s * (0.9 + rand() * 0.3), s); });
    dec.forEach((_, i) => dm.setColorAt(i, cc.copy(greens[Math.floor(rand() * greens.length)]).multiplyScalar(0.8 + rand() * 0.35)));
    dm.castShadow = true; scene.add(dm);
    const cm = instanced(cone, crownMat, con, (o, [x, z, r]) => { o.position.set(x, r * 0.9, z); const s = r * 1.2; o.scale.set(s, s * 1.5, s); });
    con.forEach((_, i) => cm.setColorAt(i, cc.copy(pines[Math.floor(rand() * pines.length)]).multiplyScalar(0.85 + rand() * 0.3)));
    cm.castShadow = true; scene.add(cm);

    const cars: [number, number, number][] = [];
    for (const s of [-1, 1]) for (let r = 0; r < 4; r++) for (let i = 0; i < 34; i++) {
      if (rand() < 0.25) continue;
      cars.push([-88 + i * 5.35, s * lotZ + (-33 + r * 21 + (r % 2 ? -3 : 3)), rand() < 0.5 ? 0 : Math.PI]);
    }
    const body = instanced(mergeParts([{ w: 1.85, h: 0.7, d: 4.4, y: 0.55 }]), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.6, envMapIntensity: 1 }), cars, (o, c) => { o.position.set(c[0], 0.05, c[1]); o.rotation.y = c[2]; });
    const pal = ['#e8e8e6', '#1c1f24', '#9aa1a8', '#b2271f', '#2a4f8f', '#d9d2c0', '#3e4a3a', '#c9ccd0'].map(lin);
    cars.forEach((_, i) => body.setColorAt(i, pal[Math.floor(rand() * pal.length)]));
    body.castShadow = true; scene.add(body);
    scene.add(instanced(mergeParts([{ w: 1.65, h: 0.55, d: 2.3, y: 1.17, z: -0.2 }]), new THREE.MeshStandardMaterial({ color: lin('#1a2128'), roughness: 0.1, metalness: 0.8, envMapIntensity: 1.2 }), cars, (o, c) => { o.position.set(c[0], 0.05, c[1]); o.rotation.y = c[2]; }));

    const lamps: Frame[] = []; ALL.forEach(k => { lamps.push(...along(k, 111, 32)); lamps.push(...along(k, 77.5, 26)); });
    scene.add(instanced(mergeParts([{ geo: new THREE.CylinderGeometry(0.12, 0.18, 9, 6), y: 4.5 }, { w: 0.25, h: 0.18, d: 1.8, y: 9, z: -0.7 }]), M.steelDark, lamps, (o, f) => { o.position.set(f.x, 0, f.z); o.rotation.y = Math.atan2(f.nx, f.nz); }));
    const lg: number[] = []; lamps.forEach(f => lg.push(f.x, 9.2, f.z));
    const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lg, 3));
    this.lampGlow = new THREE.Points(lgeo, new THREE.PointsMaterial({ map: tex.glow, size: 9, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd9a0, fog: false }));
    scene.add(this.lampGlow);

    const bl: [number, number, number, number, number, number][] = [];
    for (let i = 0; i < (coarse ? 260 : 520); i++) {
      const a = rand() * Math.PI * 2, r = 720 + rand() * 620, w = 18 + rand() * 34, d = 18 + rand() * 34, h = 12 + Math.pow(rand(), 2.2) * 110 * (r > 950 ? 1.4 : 1);
      bl.push([Math.cos(a) * r, Math.sin(a) * r, w, h, d, rand() * Math.PI]);
    }
    const city = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), M.city, bl, (o, [x, z, w, h, d, ry]) => { o.position.set(x, 0, z); o.rotation.y = ry; o.scale.set(w, h, d); });
    const tints = ['#d9d6cf', '#b9c0c6', '#cfc4b4', '#9aa5ad', '#e6e2da'].map(lin);
    bl.forEach((_, i) => city.setColorAt(i, tints[Math.floor(rand() * tints.length)]));
    city.receiveShadow = true; scene.add(city);

    const sp: number[] = [];
    for (let i = 0; i < 1800; i++) { const v = new THREE.Vector3().setFromSphericalCoords(4500, Math.acos(0.08 + rand() * 0.92), rand() * Math.PI * 2); sp.push(v.x, v.y, v.z); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    scene.add(this.stars);
  }

  /* ---------- day / night ---------- */
  private applyEnv(k: number) {
    const elev = DAY_ELEV + (NIGHT_ELEV - DAY_ELEV) * k;
    this.skyParams(this.sky, elev);
    this.placeSun(elev);
    const sunUp = smooth(-3, 9, elev), golden = 1 - smooth(4, 15, elev);
    this.sun.intensity = 3.4 * sunUp + 0.25 * (1 - sunUp);
    this.sun.color.setRGB(1, 0.86 - 0.18 * golden, 0.68 - 0.3 * golden).convertSRGBToLinear();
    if (sunUp < 0.5) this.sun.color.copy(lin('#8ea4e0'));
    this.hemi.intensity = 0.25 * sunUp + 0.08;
    const night = smooth(0.35, 0.85, k);
    this.flood.intensity = 1.2 * night; this.flood2.intensity = 0.7 * night;
    (this.scene.fog as THREE.Fog).color.copy(lin('#d9cdb8')).lerp(lin('#0d1322'), smooth(0.2, 0.8, k));
    this.scene.environment = k < 0.55 ? this.envDay : this.envNight;
    if (this.roofGlow) this.roofGlow.material.opacity = night;
    if (this.lampGlow) this.lampGlow.material.opacity = smooth(0.3, 0.7, k) * 0.9;
    if (this.stars) this.stars.material.opacity = smooth(0.6, 1, k);
    this.M.glass.emissiveIntensity = 0.35 * night;
    this.M.lights.emissiveIntensity = 0.05 + 5 * night;
    this.M.ads.emissiveIntensity = 0.5 + 0.9 * night;
    this.M.city.emissiveIntensity = 1.6 * smooth(0.4, 0.9, k);
    this.renderer.toneMappingExposure = 0.6 + 0.25 * night;
  }

  /* ---------- camera ---------- */
  private aspectBoost() { const a = this.camera.aspect; return a < 1 ? Math.min(2.1, 1.25 / a) : a < 1.4 ? 1.2 : 1; }
  private overviewPose() { const s = this.aspectBoost(); return new THREE.Vector3(0, 235 * s, 140 * s); }
  private flyTo(pos: THREE.Vector3, look: THREE.Vector3, opts: { dur?: number; fov?: number; lift?: number }, done?: () => void) {
    const p0 = this.camera.position.clone(), l0 = this.controls.target.clone();
    const ctrl = p0.clone().lerp(pos, 0.5); ctrl.y += opts.lift ?? p0.distanceTo(pos) * 0.16;
    this.tween = { t: 0, dur: this.reduced ? 0.01 : opts.dur ?? 1.7, p0, p1: pos.clone(), ctrl, l0, l1: look.clone(), f0: this.camera.fov, f1: opts.fov ?? this.camera.fov, done };
    this.controls.enabled = false; this.controls.autoRotate = false;
    this.cb.onBusy(true); this.cb.onTip(null); this.canvas.classList.remove('pointer');
  }
  private stepTween(dt: number) {
    const tw = this.tween!;
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const e = ease(tw.t), a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
    this.camera.position.set(a * tw.p0.x + b * tw.ctrl.x + c * tw.p1.x, a * tw.p0.y + b * tw.ctrl.y + c * tw.p1.y, a * tw.p0.z + b * tw.ctrl.z + c * tw.p1.z);
    this.controls.target.lerpVectors(tw.l0, tw.l1, e);
    this.camera.fov = tw.f0 + (tw.f1 - tw.f0) * e; this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.controls.target);
    if (tw.t >= 1) { this.tween = null; this.cb.onBusy(false); tw.done?.(); }
  }
  private configureControls(mode: Mode, look?: THREE.Vector3) {
    const c = this.controls;
    c.minAzimuthAngle = -Infinity; c.maxAzimuthAngle = Infinity;
    if (mode === 0) {
      c.enabled = true; c.enableZoom = true; c.enableRotate = true; c.rotateSpeed = 0.55;
      c.minDistance = 120; c.maxDistance = 560; c.minPolarAngle = 0.04; c.maxPolarAngle = 1.22;
      c.autoRotate = !this.reduced && !this.userTouched; c.autoRotateSpeed = 0.3;
    } else if (mode === 3 && look) {
      const dir = new THREE.Vector3().subVectors(look, this.camera.position).normalize();
      c.target.copy(this.camera.position).addScaledVector(dir, 0.6);
      c.enabled = true; c.enableZoom = false; c.enableRotate = true; c.rotateSpeed = -0.32;
      c.minDistance = c.maxDistance = 0.6;
      const off = new THREE.Vector3().subVectors(this.camera.position, c.target);
      const theta = Math.atan2(off.x, off.z), phi = Math.acos(Math.max(-1, Math.min(1, off.y / 0.6)));
      c.minAzimuthAngle = theta - 1.25; c.maxAzimuthAngle = theta + 1.25;
      c.minPolarAngle = Math.max(0.35, phi - 0.55); c.maxPolarAngle = Math.min(2.3, phi + 0.7);
      c.autoRotate = false;
    } else {
      c.enabled = false;
    }
  }

  /* ---------- picking ---------- */
  private state(): EngineState { return { mode: this.mode, stand: this.curStand, block: this.curBlock, seat: this.curSeat }; }
  private freeIn(ids: number[]) { let n = 0; for (const i of ids) if (this.statuses[i] === 0) n++; return n; }
  private standFree(k: number) { return this.freeIn(this.layout.standSeats[k]); }
  private standFrom(k: number) { return Math.min(...this.layout.standBlocks[k].map(b => this.layout.blocks[b].price)); }
  private setNdc() { this.ndc.set(this.mouse.x / innerWidth * 2 - 1, -(this.mouse.y / innerHeight) * 2 + 1); this.ray.setFromCamera(this.ndc, this.camera); }
  private pickStand(): number { this.setNdc(); const h = this.ray.intersectObjects(this.terraces, false); return h.length ? (h[0].object.userData.stand as number) : -1; }
  private pickBlock(k: number): number {
    this.setNdc();
    const h = this.ray.intersectObject(this.terraces[k], false);
    if (!h.length) return -1;
    const p = h[0].point; let best = -1, bd = 9;
    for (const i of this.layout.standSeats[k]) { const s = this.layout.seats[i], d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best >= 0 ? this.layout.seats[best].block : -1;
  }
  private pickSeat(id: number): number {
    const b = this.layout.blocks[id], pv = this.pv;
    pv.set(b.c[0], b.c[1], b.c[2]).project(this.camera); const ax = pv.x, ay = pv.y;
    pv.set(b.c[0] + SEAT_W * -b.n[1], b.c[1], b.c[2] + SEAT_W * b.n[0]).project(this.camera);
    const spacing = Math.hypot((pv.x - ax) * innerWidth / 2, (pv.y - ay) * innerHeight / 2), thr = Math.max(12, spacing * 0.9);
    let best = -1, bd = 1e9;
    for (const i of b.seats) {
      const s = this.layout.seats[i]; pv.set(s.x, s.y + 0.5, s.z).project(this.camera);
      const sx = (pv.x + 1) / 2 * innerWidth, sy = (1 - pv.y) / 2 * innerHeight, d = (sx - this.mouse.x) ** 2 + (sy - this.mouse.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return bd <= thr * thr ? best : -1;
  }
  private tip(eyebrow: string, title: string, sub: string, price: string, priceLabel: string, warn = false) {
    this.cb.onTip({ x: this.mouse.x, y: this.mouse.y, eyebrow, title, sub, price, priceLabel, warn });
    this.canvas.classList.add('pointer');
  }
  private noTip() { this.cb.onTip(null); this.canvas.classList.remove('pointer'); }
  private doHover() {
    this.mouse.dirty = false;
    if (!this.mouse.in || this.tween || this.coarse) return;
    const { layout, U } = this;
    if (this.mode === 0) {
      const k = this.pickStand();
      this.previewStand(k);
      if (k >= 0) this.tip('From', STANDS[k].name, `${this.standFree(k).toLocaleString('en-IN')} left · Gate ${STANDS[k].gate}`, rupee(this.standFrom(k)), 'Per seat');
      else this.noTip();
    } else if (this.mode === 1) {
      const id = this.pickBlock(this.curStand);
      U.uHoverBlock.value = id;
      if (id >= 0) { const b = layout.blocks[id], f = this.freeIn(b.seats); this.tip(TIERS[b.tier].name, 'Block ' + b.label, f ? f + ' left' : 'Sold out', rupee(b.price), 'Per seat', !f); }
      else {
        const k = this.pickStand();
        if (k >= 0 && k !== this.curStand) this.tip('Switch to', STANDS[k].name, `${this.standFree(k).toLocaleString('en-IN')} left`, rupee(this.standFrom(k)), 'From');
        else this.noTip();
      }
    } else if (this.mode === 2) {
      const i = this.pickSeat(this.curBlock), st = i >= 0 ? this.statuses[i] : -1;
      U.uHoverSeat.value = st === 0 ? i : -1;
      if (i >= 0) { const s = layout.seats[i], b = layout.blocks[this.curBlock]; this.tip('Row ' + s.row, 'Seat ' + s.num, st === 0 ? 'Open · click to see the view' : st === 2 ? 'Your seat' : 'Booked', rupee(b.price), 'Price', st === 1); }
      else this.noTip();
    } else this.noTip();
  }
  private handleClick() {
    if (this.tween) return;
    const { layout } = this;
    if (this.mode === 0) { const k = this.pickStand(); if (k >= 0) this.goStand(k); }
    else if (this.mode === 1) {
      const id = this.pickBlock(this.curStand);
      if (id >= 0) { if (this.freeIn(layout.blocks[id].seats)) this.goBlock(id); else this.cb.onFlash(`Block ${layout.blocks[id].label} is sold out. Pick another block.`); }
      else { const k = this.pickStand(); if (k >= 0 && k !== this.curStand) this.goStand(k); }
    } else if (this.mode === 2) {
      const i = this.pickSeat(this.curBlock);
      if (i < 0) return;
      if (this.statuses[i] !== 1) this.goSeat(i);
      else this.cb.onFlash('That seat is booked. Pick a white seat.');
    }
  }

  private bindEvents() {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void) => {
      t.addEventListener(type, fn as EventListener); this.disposers.push(() => t.removeEventListener(type, fn as EventListener));
    };
    on(c, 'pointerdown', (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; this.userTouched = true; this.controls.autoRotate = false; clearTimeout(this.idleT); });
    on(c, 'pointerup', (e: PointerEvent) => {
      if (!this.down) return;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      this.down = null;
      if (this.mode === 0) this.idleT = window.setTimeout(() => { if (this.mode === 0 && !this.tween && !this.reduced) this.controls.autoRotate = true; }, 9000);
      if (moved < 7) { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.handleClick(); }
    });
    on(c, 'pointermove', (e: PointerEvent) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.in = true; this.mouse.dirty = true; });
    on(c, 'pointerleave', () => {
      this.mouse.in = false; this.noTip();
      if (this.mode === 0) this.previewStand(-1);
      if (this.mode === 1) this.U.uHoverBlock.value = -1;
      if (this.mode === 2) this.U.uHoverSeat.value = -1;
    });
    on(window, 'resize', () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight, false);
    });
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.tween) this.stepTween(dt);
    else if (this.controls.enabled) this.controls.update();
    if (Math.abs(this.envK - this.envTarget) > 0.001) {
      this.envK += Math.sign(this.envTarget - this.envK) * Math.min(Math.abs(this.envTarget - this.envK), dt / (this.reduced ? 0.01 : 1.4));
      this.applyEnv(ease(this.envK)); this.shadowDirty = true;
    }
    if (this.shadowDirty) { this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = false; }
    if (this.mouse.dirty) this.doHover();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };
}

