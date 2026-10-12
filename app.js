import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* ============ 設定 ============ */
const GAP = 3.2;
const MAX_PER_ROW = 14;
const MAX_FILES = 2500;

const EXT_COLORS = {
  js: 0xffd94d, ts: 0x4da3ff, jsx: 0x61dafb, tsx: 0x61dafb,
  py: 0xffcf40, rb: 0xff5555, go: 0x4de3e3, rs: 0xff7a4d,
  java: 0xff6b5e, kt: 0xb07aff, cs: 0x7de08a, 'c++': 0xff9a5c,
  cpp: 0xff9a5c, c: 0xff9a5c, h: 0xff9a5c, hpp: 0xff9a5c,
  vue: 0x41b883, svelte: 0xff5a2a, php: 0x9a8bff, swift: 0xff8a4d,
  gd: 0x59c7ff, shader: 0x9a6bff, gdshader: 0x9a6bff,
  json: 0xb48cff, yml: 0xb48cff, yaml: 0xb48cff, toml: 0xb48cff,
  md: 0xdfe6f5, txt: 0xdfe6f5,
  png: 0xff6bc0, jpg: 0xff6bc0, svg: 0xff6bc0, glb: 0xff6bc0, tscn: 0xff6bc0,
  css: 0x6bd5ff, scss: 0x6bd5ff, html: 0xff7a59,
};
const DISTRICT_ACCENTS = [0x2f7bff, 0x2ee6a0, 0xff9a3c, 0xe84fa0, 0x9a6bff, 0x2ee6e6];
const LEGEND = [['js/ts', 'js'], ['py', 'py'], ['C/C++', 'cpp'], ['C#', 'cs'], ['Go', 'go'], ['Rust', 'rs'], ['Java', 'java'], ['json/yml', 'json'], ['docs', 'md'], ['画像等', 'png'], ['CSS', 'css'], ['HTML', 'html']];

/* ============ DOM ============ */
const $ = (id) => document.getElementById(id);
const canvas = $('scene'), tooltip = $('tooltip'), loader = $('loader'), loaderText = $('loaderText');
const statusEl = $('status'), statsEl = $('stats'), detailEl = $('detail');

/* ============ Three.js 基本 ============ */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
scene.fog = new THREE.Fog(0x05070f, 120, 420);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(60, 55, 60);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x0a0c18, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(80, 120, 40);
scene.add(dir);
const p1 = new THREE.PointLight(0x4da3ff, 8000, 300); p1.position.set(-40, 40, -30); scene.add(p1);
const p2 = new THREE.PointLight(0xb06bff, 6000, 300); p2.position.set(60, 30, 60); scene.add(p2);

const grid = new THREE.GridHelper(600, 60, 0x2a4a8a, 0x14224a);
grid.position.y = -0.3;
grid.material.transparent = true; grid.material.opacity = 0.5;
scene.add(grid);

// 星空
{
  const g = new THREE.BufferGeometry();
  const N = 600, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 500 + Math.random() * 300, t = Math.random() * Math.PI * 2, p = Math.random() * Math.PI;
    pos[i * 3] = r * Math.sin(p) * Math.cos(t); pos[i * 3 + 1] = Math.abs(r * Math.cos(p)) + 10; pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8fb8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
}

const cityGroup = new THREE.Group();
scene.add(cityGroup);

/* Bloomでネオン感を増す */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.7, 0.82);
composer.addPass(bloom);

/* コード立体ビュー用のグループ */
const codeGroup = new THREE.Group();
codeGroup.visible = false;
scene.add(codeGroup);
let viewMode = 'city'; // 'city' | 'code'
let codeSpinners = []; // 回転・浮遊させるオブジェクト
let selectedFile = null;

/* ============ 状態 ============ */
let buildings = null;      // InstancedMesh
let roofLights = null;
let fileList = [];         // instanceId -> file
let baseColors = [];       // THREE.Color
let targetHeights = [];
let baseMatrices = [];
let introStart = 0;
let heightScale = 1;
let currentRepo = null;
let hovered = -1;

/* ============ ユーティリティ ============ */
function colorForExt(path) {
  const parts = path.toLowerCase().split('.');
  const ext = parts.length > 1 ? parts.pop() : '';
  return new THREE.Color(EXT_COLORS[ext] ?? 0x7f8fff);
}
function heightForSize(size) {
  const s = Math.max(Number(size) || 1, 1);
  return THREE.MathUtils.clamp(1.2 + (Math.log10(s + 1) * 4.5), 1.5, 24);
}
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function showStatus(msg) { statusEl.textContent = msg; statusEl.classList.remove('hidden'); }
function hideStatus() { statusEl.classList.add('hidden'); }
function setLoading(on, msg = '読み込み中...') {
  loader.classList.toggle('hidden', !on);
  if (on) loaderText.textContent = msg;
}
function parseGitHubUrl(url) {
  let u = (url || '').trim().replace(/\.git$/, '').replace(/\/$/, '');
  const m = u.match(/github\.com[:/]([^/\s]+)\/([^/\s?#\/]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/* ============ 凡例 ============ */
{
  const box = $('legendItems');
  for (const [label, ext] of LEGEND) {
    const c = new THREE.Color(EXT_COLORS[ext] ?? 0x7f8fff);
    const div = document.createElement('div');
    div.className = 'leg';
    div.innerHTML = `<span class="dot" style="background:#${c.getHexString()};box-shadow:0 0 6px #${c.getHexString()}"></span>${label}`;
    box.appendChild(div);
  }
}

/* ============ 都市生成 ============ */
function clearCity() {
  cityGroup.clear();
  buildings = null; roofLights = null; fileList = []; baseColors = []; targetHeights = []; baseMatrices = [];
  hovered = -1;
}

function makeLabelSprite(text, accentCss) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(5,8,20,0.72)';
  ctx.beginPath(); ctx.roundRect(4, 8, 504, 80, 18); ctx.fill();
  ctx.strokeStyle = accentCss; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const short = text.length > 26 ? text.slice(0, 25) + '…' : text;
  ctx.fillText(short, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(22, 4.1, 1);
  return sp;
}

function buildCity(files, repoInfo) {
  clearCity();
  currentRepo = repoInfo;

  // 地区分け
  const districts = new Map();
  for (const f of files) {
    const parts = f.path.split('/');
    const key = parts.length === 1 ? '(root)' : parts[0];
    if (!districts.has(key)) districts.set(key, []);
    districts.get(key).push(f);
  }
  let keys = [...districts.keys()].sort((a, b) => districts.get(b).length - districts.get(a).length).slice(0, 24);

  // 配置計算（全ビル位置を先に確定）
  const placements = [];
  let cursorX = 0, totalSize = 0;
  keys.forEach((key, di) => {
    const list = districts.get(key).sort((a, b) => b.size - a.size);
    list.forEach((f) => (totalSize += f.size));
    const cols = Math.min(MAX_PER_ROW, Math.max(4, Math.ceil(Math.sqrt(list.length)) + 2));
    const rows = Math.ceil(list.length / cols);
    const w = cols * GAP, d = rows * GAP;
    const ox = cursorX + w / 2;
    list.forEach((f, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      placements.push({
        file: f, district: key, di,
        x: ox + (col - cols / 2 + 0.5) * GAP,
        z: (row - rows / 2 + 0.5) * GAP,
        h: heightForSize(f.size),
      });
    });
    // 地面プレート + 枠
    const accent = new THREE.Color(DISTRICT_ACCENTS[di % DISTRICT_ACCENTS.length]);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 6, d + 6),
      new THREE.MeshStandardMaterial({ color: 0x0a0f1e, emissive: accent, emissiveIntensity: 0.12, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2; ground.position.set(ox, 0, 0);
    cityGroup.add(ground);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 6, 0.25, d + 6),
      new THREE.MeshStandardMaterial({ color: accent.clone().multiplyScalar(0.4), emissive: accent, emissiveIntensity: 0.7 })
    );
    frame.position.set(ox, -0.16, 0);
    cityGroup.add(frame);
    const label = makeLabelSprite(`${key} (${list.length})`, `#${accent.getHexString()}`);
    label.position.set(ox, 15 + list.length * 0.02, -d / 2 - 4);
    cityGroup.add(label);
    cursorX += w + 12;
  });
  cityGroup.position.x = -cursorX / 2;

  // ビル InstancedMesh
  const n = placements.length;
  const geo = new THREE.BoxGeometry(1.7, 1, 1.7);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.25 });
  buildings = new THREE.InstancedMesh(geo, mat, n);
  buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const roofGeo = new THREE.BoxGeometry(0.5, 0.18, 0.5);
  roofGeo.translate(0, 0.09, 0);
  roofLights = new THREE.InstancedMesh(roofGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3();
  placements.forEach((p, i) => {
    fileList[i] = { ...p.file, district: p.district };
    targetHeights[i] = p.h;
    const col = colorForExt(p.file.path);
    baseColors[i] = col;
    buildings.setColorAt(i, col);
    pv.set(p.x, 0, p.z); s.set(1, 0.01, 1);
    m.compose(pv, q, s);
    buildings.setMatrixAt(i, m);
    baseMatrices[i] = { x: p.x, z: p.z };
    m.compose(new THREE.Vector3(p.x, p.h + 0.05, p.z), q, new THREE.Vector3(1, 1, 1));
    roofLights.setMatrixAt(i, m);
  });
  buildings.instanceColor.needsUpdate = true;
  cityGroup.add(buildings);
  cityGroup.add(roofLights);
  introStart = performance.now();

  // カメラフィット
  const width = cursorX;
  controls.target.set(0, 6, 0);
  camera.position.set(width * 0.45 + 30, 55, width * 0.45 + 40);
  controls.update();

  // 統計
  $('stFiles').textContent = n.toLocaleString();
  $('stDistricts').textContent = keys.length;
  $('stSize').textContent = fmtBytes(totalSize);
  $('stRepo').textContent = `${repoInfo.owner}/${repoInfo.repo}`;
  statsEl.classList.remove('hidden');
  applyFilter($('filterInput').value);
}

/* ============ 成長アニメーション ============ */
function tickIntro(now) {
  if (!buildings || targetHeights.length === 0) return;
  const elapsed = (now - introStart) / 1000;
  if (elapsed > 3.5) return;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), s = new THREE.Vector3();
  const rm = new THREE.Matrix4();
  let dirty = false;
  for (let i = 0; i < targetHeights.length; i++) {
    const t = THREE.MathUtils.clamp(elapsed * 1.6 - i * 0.0004, 0, 1);
    if (t >= 1) continue;
    dirty = true;
    const e = 1 - Math.pow(1 - t, 3);
    const h = Math.max(0.01, targetHeights[i] * heightScale * e);
    pv.set(baseMatrices[i].x, 0, baseMatrices[i].z); s.set(1, h, 1);
    m.compose(pv, q, s);
    buildings.setMatrixAt(i, m);
    rm.compose(new THREE.Vector3(baseMatrices[i].x, h + 0.05, baseMatrices[i].z), q, new THREE.Vector3(1, 1, 1));
    roofLights.setMatrixAt(i, rm);
  }
  if (dirty) { buildings.instanceMatrix.needsUpdate = true; roofLights.instanceMatrix.needsUpdate = true; }
  else {
    // 最終確定
    for (let i = 0; i < targetHeights.length; i++) {
      const h = targetHeights[i] * heightScale;
      pv.set(baseMatrices[i].x, 0, baseMatrices[i].z); s.set(1, h, 1);
      m.compose(pv, q, s); buildings.setMatrixAt(i, m);
      rm.compose(new THREE.Vector3(baseMatrices[i].x, h + 0.05, baseMatrices[i].z), q, new THREE.Vector3(1, 1, 1));
      roofLights.setMatrixAt(i, rm);
    }
    buildings.instanceMatrix.needsUpdate = true; roofLights.instanceMatrix.needsUpdate = true;
    targetHeights = []; // 終了
  }
}

/* ============ ピッキング ============ */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let mouseClient = { x: 0, y: 0 };

function pick(ev) {
  if (!buildings) return -1;
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObject(buildings);
  return hit.length ? hit[0].instanceId : -1;
}

renderer.domElement.addEventListener('pointermove', (ev) => {
  if (viewMode !== 'city' || !buildings) { tooltip.classList.add('hidden'); return; }
  mouseClient = { x: ev.clientX, y: ev.clientY };
  const id = pick(ev);
  if (id !== hovered) {
    if (hovered >= 0 && baseColors[hovered]) buildings.setColorAt(hovered, baseColors[hovered]);
    hovered = id;
    if (hovered >= 0) {
      buildings.setColorAt(hovered, new THREE.Color(0xffffff));
      const f = fileList[hovered];
      tooltip.textContent = `${f.path} (${fmtBytes(f.size)})`;
      tooltip.classList.remove('hidden');
      renderer.domElement.style.cursor = 'pointer';
    } else {
      tooltip.classList.add('hidden');
      renderer.domElement.style.cursor = 'grab';
    }
    if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  }
  if (hovered >= 0) {
    tooltip.style.left = mouseClient.x + 14 + 'px';
    tooltip.style.top = mouseClient.y + 10 + 'px';
  }
});

renderer.domElement.addEventListener('click', (ev) => {
  if (viewMode !== 'city') return;
  const id = pick(ev);
  if (id < 0 || !currentRepo) { detailEl.classList.add('hidden'); return; }
  const f = fileList[id];
  selectedFile = f;
  const ext = (f.path.split('.').pop() || '').toLowerCase();
  $('dExt').textContent = ext || 'file';
  $('dPath').textContent = f.path;
  $('dMeta').textContent = `${f.district} / ${fmtBytes(f.size)}`;
  $('dLink').href = `https://github.com/${currentRepo.owner}/${currentRepo.repo}/blob/${currentRepo.branch}/${f.path}`;
  const codeBtn = $('dCode3d');
  if (isCodeViewable(f.path, f.size)) {
    codeBtn.style.display = '';
    codeBtn.textContent = '🧬 コードを立体化';
  } else {
    codeBtn.style.display = f.size < 300 * 1024 ? '' : 'none';
    codeBtn.textContent = '🧬 開いてみる';
  }
  detailEl.classList.remove('hidden');
});
$('detailClose').onclick = () => detailEl.classList.add('hidden');
$('dCode3d').onclick = () => { if (selectedFile) enterCodeView(selectedFile); };
$('codeBack').onclick = () => setView('city');

/* ============ フィルタ・高さ ============ */
function applyFilter(q) {
  if (!buildings) return;
  q = (q || '').toLowerCase().trim();
  for (let i = 0; i < fileList.length; i++) {
    const match = !q || fileList[i].path.toLowerCase().includes(q);
    const c = match ? baseColors[i] : baseColors[i].clone().multiplyScalar(0.12);
    buildings.setColorAt(i, c);
  }
  buildings.instanceColor.needsUpdate = true;
  if (hovered >= 0) { buildings.setColorAt(hovered, new THREE.Color(0xffffff)); buildings.instanceColor.needsUpdate = true; }
}
$('filterInput').addEventListener('input', (e) => applyFilter(e.target.value));

$('heightRange').addEventListener('input', (e) => {
  heightScale = parseFloat(e.target.value);
  if (!buildings) return;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), s = new THREE.Vector3(), rm = new THREE.Matrix4();
  for (let i = 0; i < fileList.length; i++) {
    const h = Math.max(0.05, (targetHeights[i] || heightForSize(fileList[i].size)) * heightScale);
    // targetHeights が空（アニメ終了後）は再計算用に保持
    pv.set(baseMatrices[i].x, 0, baseMatrices[i].z); s.set(1, h, 1);
    m.compose(pv, q, s); buildings.setMatrixAt(i, m);
    rm.compose(new THREE.Vector3(baseMatrices[i].x, h + 0.05, baseMatrices[i].z), q, new THREE.Vector3(1, 1, 1));
    roofLights.setMatrixAt(i, rm);
  }
  buildings.instanceMatrix.needsUpdate = true; roofLights.instanceMatrix.needsUpdate = true;
});

/* ============ ソースコードの立体化（コードタワー） ============ */
const CODE_EXTS = new Set(['js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'cs', 'cpp', 'c', 'h', 'hpp', 'php', 'swift', 'gd', 'shader', 'gdshader', 'css', 'scss', 'html', 'json', 'yml', 'yaml', 'toml', 'md', 'txt', 'sh', 'sql']);
function isCodeViewable(path, size) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return CODE_EXTS.has(ext) && size < 300 * 1024;
}
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// 1行の構文種別 → 色。コメント緑・文字列橙・キーワード青・括弧紫・空行暗
function lineColorFor(line) {
  const t = line.trim();
  if (!t) return new THREE.Color(0x1a2340);
  if (/^(\/\/|#|\/\*|\*|<!--|--|")/.test(t)) return new THREE.Color(0x3ddc84);
  if (/["'`]/.test(t) && /(const|let|var|=|return|import|from|require)/.test(t)) return new THREE.Color(0xff9a3c);
  if (/["'`]/.test(t)) return new THREE.Color(0xffc46b);
  if (/^(import|export|from|function|class|const|let|var|if|for|while|return|def|public|private|fn|func|package|using|namespace)\b/.test(t)) return new THREE.Color(0x4da3ff);
  if (/^[{}()[\];,]+$/.test(t)) return new THREE.Color(0x9a6bff);
  if (/[{}\[\]();]/.test(t)) return new THREE.Color(0x7f8fff);
  return new THREE.Color(0xb9c8ee);
}

function makeCharSprite(ch, colorCss) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 42px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = colorCss; ctx.shadowBlur = 12;
  ctx.fillStyle = colorCss;
  ctx.fillText(ch, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const s = 0.9 + Math.random() * 1.2;
  sp.scale.set(s, s, 1);
  return sp;
}

/* コード文字列 → 3Dタワーを生成。1行=1ブロック(長さ=行長、色=構文種) */
function buildCodeTower(codeText, filePath) {
  codeGroup.clear();
  codeSpinners = [];
  const lines = codeText.split('\n').slice(0, 350);
  const LH = 0.55; // 行ピッチ
  const towerH = Math.max(8, lines.length * LH);
  const baseColor = colorForExt(filePath);

  // 土台
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 18, 1, 40),
    new THREE.MeshStandardMaterial({ color: 0x0a0f1e, emissive: baseColor, emissiveIntensity: 0.35, roughness: 0.6 })
  );
  disc.position.y = -0.5;
  codeGroup.add(disc);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(16, 0.22, 12, 60),
    new THREE.MeshBasicMaterial({ color: baseColor })
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.1;
  codeGroup.add(ring);

  // 背骨（中央の光柱）
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, towerH + 6, 16),
    new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.55 })
  );
  pillar.position.y = towerH / 2;
  codeGroup.add(pillar);

  // 行ブロック
  const geo = new THREE.BoxGeometry(1, 0.34, 0.9);
  const matCache = new Map();
  const matFor = (hex) => {
    if (!matCache.has(hex)) {
      const col = new THREE.Color(hex);
      matCache.set(hex, new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.55), emissive: col, emissiveIntensity: 0.85, roughness: 0.4 }));
    }
    return matCache.get(hex);
  };
  let maxW = 1;
  lines.forEach((line, i) => {
    const indent = (line.match(/^[\s]*/) || [''])[0].length;
    const len = Math.min(line.trim().length, 110);
    const w = 0.6 + len * 0.22;
    maxW = Math.max(maxW, w);
    const col = lineColorFor(line);
    const mesh = new THREE.Mesh(geo, matFor(col.getHex()));
    const y = i * LH + 1;
    // らせん状に少し回転させると立体感が出て面白い
    const ang = (indent * 0.28) % (Math.PI * 2);
    mesh.position.set(Math.cos(ang) * indent * 0.28 + w / 2 - 4, y, Math.sin(ang) * indent * 0.28);
    mesh.scale.x = w;
    mesh.rotation.y = -ang * 0.35;
    mesh.userData.baseY = y;
    mesh.userData.phase = Math.random() * Math.PI * 2;
    codeGroup.add(mesh);
    codeSpinners.push(mesh);
  });

  // ファイル名ラベル
  const label = makeLabelSprite(`${filePath.split('/').pop()} (${lines.length}行)`, `#${baseColor.getHexString()}`);
  label.position.set(0, towerH + 4.5, 0);
  codeGroup.add(label);

  // コードの文字をサンプリングして周囲に漂わせる
  const pool = codeText.replace(/\s+/g, '').slice(0, 2000) || '{};()<>=';
  for (let i = 0; i < 90; i++) {
    const ch = pool[Math.floor(Math.random() * pool.length)];
    const sp = makeCharSprite(ch, i % 3 === 0 ? '#4da3ff' : i % 3 === 1 ? '#b06bff' : '#7de08a');
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 12;
    sp.position.set(Math.cos(a) * r, Math.random() * (towerH + 4), Math.sin(a) * r);
    sp.userData = { a, r, y0: sp.position.y, sp: 0.2 + Math.random() * 0.6, ph: Math.random() * 6 };
    codeGroup.add(sp);
    codeSpinners.push(sp);
  }

  // カメラをタワーにフィット
  controls.target.set(0, towerH / 2, 0);
  camera.position.set(maxW + 22, towerH * 0.75 + 8, maxW + 26);
  controls.update();
}

function setView(mode) {
  viewMode = mode;
  const isCode = mode === 'code';
  codeGroup.visible = isCode;
  cityGroup.visible = !isCode;
  $('codeView').classList.toggle('hidden', !isCode);
  if (!isCode) {
    codeGroup.clear();
    codeSpinners = [];
    if (currentRepo) {
      controls.target.set(0, 6, 0);
      camera.position.set(60, 55, 60);
    }
  }
  detailEl.classList.add('hidden');
}

async function enterCodeView(file) {
  if (!currentRepo) return;
  const ext = (file.path.split('.').pop() || '').toLowerCase();
  setLoading(true, `コード取得中... ${file.path}`);
  try {
    const url = `https://raw.githubusercontent.com/${currentRepo.owner}/${currentRepo.repo}/${currentRepo.branch}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`取得失敗 (HTTP ${res.status})`);
    const text = await res.text();
    if (!text || text.includes('\0')) throw new Error('バイナリのため表示できません');
    if (text.length > 300 * 1024) throw new Error('大きすぎるファイルのため表示できません');
    buildCodeTower(text, file.path);
    setView('code');
    $('cExt').textContent = ext || 'file';
    $('cPath').textContent = file.path;
    const nLines = text.split('\n').length;
    $('cMeta').textContent = `${nLines}行 / ${fmtBytes(text.length)} / 1行=1ブロック`;
    $('cLink').href = `https://github.com/${currentRepo.owner}/${currentRepo.repo}/blob/${currentRepo.branch}/${file.path}`;
    const shown = text.split('\n').slice(0, 200).map((l, i) => `<span class="ln">${String(i + 1).padStart(3, ' ')} </span>${escapeHtml(l)}`).join('\n');
    $('cCode').innerHTML = shown + (nLines > 200 ? `\n<span class="ln">... 残り${nLines - 200}行は3Dタワーで</span>` : '');
  } catch (err) {
    showStatus(`❌ ${err.message}`);
    setTimeout(hideStatus, 3000);
  } finally {
    setLoading(false);
  }
}

/* ============ GitHub API ============ */
async function fetchRepo(input) {
  const info = parseGitHubUrl(input);
  if (!info) { showStatus('❌ URLを解析できません。例: https://github.com/vuejs/core'); return; }
  setLoading(true, 'リポジトリ情報を取得中...');
  hideStatus();
  detailEl.classList.add('hidden');
  try {
    const headers = { Accept: 'application/vnd.github+json' };
    const metaRes = await fetch(`https://api.github.com/repos/${info.owner}/${info.repo}`, { headers });
    if (metaRes.status === 404) throw new Error('リポジトリが見つかりません (404)。URLを確認してください。');
    if (metaRes.status === 403) throw new Error('API制限 (403)。少し待って再試行してください。');
    if (!metaRes.ok) throw new Error(`リポジトリ情報の取得失敗 (HTTP ${metaRes.status})`);
    const meta = await metaRes.json();
    info.branch = meta.default_branch || 'main';
    info.stars = meta.stargazers_count ?? 0;

    setLoading(true, `ツリー取得中... (branch: ${info.branch})`);
    const treeRes = await fetch(`https://api.github.com/repos/${info.owner}/${info.repo}/git/trees/${info.branch}?recursive=1`, { headers });
    if (treeRes.status === 403) throw new Error('API制限 (403)。少し待って再試行してください。');
    if (!treeRes.ok) throw new Error(`ツリー取得失敗 (HTTP ${treeRes.status})。巨大リポジトリの可能性があります。`);
    const treeJson = await treeRes.json();
    if (!treeJson.tree) throw new Error('ツリーJSONの解析失敗');
    if (treeJson.truncated) showStatus('⚠️ ツリーが切り詰められました (巨大リポジトリ)');
    let files = treeJson.tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, size: e.size ?? 100 }));
    if (files.length > MAX_FILES) {
      files.sort((a, b) => b.size - a.size);
      files = files.slice(0, MAX_FILES);
      showStatus(`⚠️ ファイル数が多いため大きい上位${MAX_FILES}件を表示`);
    }
    if (files.length === 0) throw new Error('ファイルが見つかりませんでした。');
    setView('city');
    buildCity(files, info);
    history.replaceState(null, '', `?repo=${info.owner}/${info.repo}`);
    setTimeout(hideStatus, 4000);
  } catch (err) {
    showStatus(`❌ ${err.message}`);
  } finally {
    setLoading(false);
  }
}

/* ============ UI配線 ============ */
$('loadBtn').onclick = () => fetchRepo($('repoInput').value);
$('repoInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchRepo(e.target.value); });
document.querySelectorAll('.samples button').forEach((b) => {
  b.onclick = () => { $('repoInput').value = `https://github.com/${b.dataset.repo}`; fetchRepo($('repoInput').value); };
});
$('rotateBtn').onclick = (e) => {
  controls.autoRotate = !controls.autoRotate;
  e.currentTarget.classList.toggle('on', controls.autoRotate);
};
$('helpBtn').onclick = () => $('help').classList.remove('hidden');
$('helpClose').onclick = () => $('help').classList.add('hidden');

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

/* ============ メインループ ============ */
function animate(now) {
  requestAnimationFrame(animate);
  tickIntro(now);
  if (viewMode === 'code') {
    const t = now / 1000;
    for (const o of codeSpinners) {
      if (o.isSprite) {
        o.position.y = o.userData.y0 + Math.sin(t * o.userData.sp + o.userData.ph) * 1.5;
        const a = o.userData.a + t * 0.08;
        o.position.x = Math.cos(a) * o.userData.r;
        o.position.z = Math.sin(a) * o.userData.r;
      } else if (o.userData.baseY !== undefined) {
        o.position.y = o.userData.baseY + Math.sin(t * 1.4 + o.userData.phase) * 0.08;
      }
    }
  } else {
    // 都市モード: ライトをゆらめかせて夜景感
    p1.intensity = 8000 + Math.sin(now / 900) * 1500;
    p2.intensity = 6000 + Math.cos(now / 1100) * 1200;
  }
  controls.update();
  composer.render();
}
requestAnimationFrame(animate);

/* ============ 初期ロード ============ */
{
  const params = new URLSearchParams(location.search);
  const q = params.get('repo');
  const initial = q ? `https://github.com/${q}` : 'https://github.com/threejs/three';
  $('repoInput').value = initial;
  fetchRepo(initial);
}
