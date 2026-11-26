// Procedural canvas textures: concrete, pitch markings, grass, roads, paving, LED boards, windows, glows.
import * as THREE from 'three';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
const CONDENSED = '"Barlow Condensed", "Arial Narrow", sans-serif';

export function createTextures(maxAniso: number) {
  function canvasTex(w: number, h: number, draw: Draw, repeat?: [number, number]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number) {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = (Math.random() - 0.5) * n; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
    g.putImageData(img, 0, 0);
  }
  function blotches(g: CanvasRenderingContext2D, w: number, h: number, count: number, color: string, rmin: number, rmax: number) {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = rmin + Math.random() * (rmax - rmin);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  const concrete = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#bdb8ae'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 40, 'rgba(90,85,75,.10)', 20, 90); blotches(g, w, h, 30, 'rgba(255,255,250,.10)', 20, 80);
    noise(g, w, h, 22);
    g.strokeStyle = 'rgba(70,66,60,.25)'; g.lineWidth = 1.5;
    for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  }, [1, 1]);

  const pitch = (() => {
    const S = 16, W = 105 * S, H = 68 * S;
    return canvasTex(W, H, g => {
      for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? '#3f8a37' : '#4c9a40'; g.fillRect(i * W / 18, 0, W / 18 + 1, H); }
      for (let j = 0; j < 10; j++) { g.fillStyle = j % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.03)'; g.fillRect(0, j * H / 10, W, H / 10 + 1); }
      blotches(g, W, H, 60, 'rgba(30,60,20,.10)', 30, 140);
      for (const [x, y] of [[S * 8, H / 2], [W - S * 8, H / 2]]) {
        const gr = g.createRadialGradient(x, y, 0, x, y, S * 7); gr.addColorStop(0, 'rgba(140,120,70,.35)'); gr.addColorStop(1, 'rgba(140,120,70,0)');
        g.fillStyle = gr; g.fillRect(x - S * 7, y - S * 7, S * 14, S * 14);
      }
      noise(g, W, H, 12);
      g.strokeStyle = 'rgba(250,252,248,.9)'; g.lineWidth = 0.12 * S; g.fillStyle = 'rgba(250,252,248,.9)';
      const m = (v: number) => v * S, o = m(0.1);
      g.strokeRect(o, o, W - 2 * o, H - 2 * o);
      g.beginPath(); g.moveTo(W / 2, o); g.lineTo(W / 2, H - o); g.stroke();
      g.beginPath(); g.arc(W / 2, H / 2, m(9.15), 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(W / 2, H / 2, m(0.22), 0, Math.PI * 2); g.fill();
      for (const side of [0, 1]) {
        const x0 = side ? W - o : o, dir = side ? -1 : 1;
        g.strokeRect(Math.min(x0, x0 + dir * m(16.5)), H / 2 - m(20.16), m(16.5), m(40.32));
        g.strokeRect(Math.min(x0, x0 + dir * m(5.5)), H / 2 - m(9.16), m(5.5), m(18.32));
        g.beginPath(); g.arc(x0 + dir * m(11), H / 2, m(0.22), 0, Math.PI * 2); g.fill();
        const a = Math.acos(5.5 / 9.15); g.beginPath();
        if (side) g.arc(x0 - m(11), H / 2, m(9.15), Math.PI - a, Math.PI + a); else g.arc(x0 + m(11), H / 2, m(9.15), -a, a);
        g.stroke();
      }
      for (const [x, y, s] of [[o, o, 0], [W - o, o, Math.PI / 2], [W - o, H - o, Math.PI], [o, H - o, -Math.PI / 2]]) {
        g.beginPath(); g.arc(x, y, m(1), s, s + Math.PI / 2); g.stroke();
      }
    });
  })();

  const grass = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#6a8a3e'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 50, 'rgba(40,70,25,.18)', 20, 70); blotches(g, w, h, 40, 'rgba(170,170,90,.12)', 15, 60);
    for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(35,65,25,.22)' : 'rgba(150,175,90,.16)'; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3); }
  }, [90, 90]);

  const road = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#3d4043'; g.fillRect(0, 0, w, h); noise(g, w, h, 18);
    g.fillStyle = 'rgba(235,235,225,.85)'; g.fillRect(0, 3, w, 2); g.fillRect(0, h - 5, w, 2);
    for (let x = 0; x < w; x += 64) g.fillRect(x, h / 2 - 1.5, 34, 3);
  }, [1, 1]);

  const pave = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#cfc8bb'; g.fillRect(0, 0, w, h); noise(g, w, h, 14);
    g.strokeStyle = 'rgba(120,112,100,.35)'; g.lineWidth = 1;
    for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    blotches(g, w, h, 10, 'rgba(90,80,70,.08)', 20, 60);
  }, [1, 1]);

  const ads = canvasTex(2048, 64, (g, w, h) => {
    const items: [string, string, string][] = [['MERIDIAN ARENA', '#0f1a24', '#ffffff'], ['COASTAL CUP FINAL', '#ff7a1a', '#1d0d02'], ['HARBOR CITY FC', '#b8241c', '#ffffff'], ['NORTHBRIDGE UNITED', '#1f3f8f', '#ffffff']];
    const seg = w / items.length;
    items.forEach((it, i) => {
      g.fillStyle = it[1]; g.fillRect(i * seg, 0, seg, h);
      g.fillStyle = it[2]; g.font = `800 42px ${CONDENSED}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(it[0], i * seg + seg / 2, h / 2 + 2);
    });
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
  });
  ads.wrapS = THREE.RepeatWrapping;

  const board = canvasTex(1024, 384, (g, w, h) => {
    g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ff7a1a'; g.font = `700 40px ${CONDENSED}`; g.fillText('COASTAL CUP FINAL · KICK-OFF 19:30', w / 2, 62);
    g.fillStyle = '#ffffff'; g.font = `800 150px ${CONDENSED}`; g.fillText('HCFC  0 : 0  NBU', w / 2, 215);
    g.fillStyle = '#98a3ab'; g.font = `600 34px ${CONDENSED}`; g.fillText('WELCOME TO MERIDIAN ARENA', w / 2, 330);
    g.fillStyle = 'rgba(0,0,0,.35)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  });

  const lot = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#45484b'; g.fillRect(0, 0, w, h); noise(g, w, h, 16);
    g.strokeStyle = 'rgba(240,240,230,.8)'; g.lineWidth = 2;
    for (let r = 0; r < 4; r++) { const y0 = 18 + r * 58; for (let x = 10; x < w - 10; x += 11) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + 22); g.stroke(); } }
  });

  const windows = (lit: boolean) => canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = lit ? '#000' : '#8c949a'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h - 4; y += 12) for (let x = 5; x < w - 4; x += 10) {
      if (lit) { if (Math.random() < 0.35) { g.fillStyle = Math.random() < 0.7 ? '#ffd9a0' : '#cfe4ff'; g.fillRect(x, y, 6, 7); } }
      else { g.fillStyle = Math.random() < 0.5 ? '#3d4952' : '#53616b'; g.fillRect(x, y, 6, 7); }
    }
  });

  const glow = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,252,240,1)'); gr.addColorStop(0.18, 'rgba(255,244,215,.7)'); gr.addColorStop(0.5, 'rgba(255,230,190,.15)'); gr.addColorStop(1, 'rgba(255,230,190,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });

  const sign = (text: string) => canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#10171d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff7a1a'; g.fillRect(0, 0, 64, h);
    g.fillStyle = '#1d0d02'; g.font = `800 46px ${CONDENSED}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 32, 34);
    g.fillStyle = '#ffffff'; g.font = `700 34px ${CONDENSED}`; g.fillText('GATE ' + text, 160, 34);
  });

  return { concrete, pitch, grass, road, pave, ads, board, lot, winDay: windows(false), winNight: windows(true), glow, sign };
}
export type Textures = ReturnType<typeof createTextures>;
