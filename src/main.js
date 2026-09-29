import './style.css';
import { makeForest } from './ecology.js';
import { createRenderer } from './renderer.js';
import { DEFAULT_DISTANCES } from './visibility.js';
import { DEFAULT_LIGHTING, DEFAULT_MATERIALS } from './appearance.js';
import edgeTreeUrl from '../assets/trees_demo/tree_edge_demo.glb?url';
import interiorTreeUrl from '../assets/trees_demo/tree_interior_demo.glb?url';

document.querySelector('#app').innerHTML = `
<aside class="panel">
  <header><div class="brand-icon">♧</div><div><h1>Pinefield<span> / LAB</span></h1><p>PROCEDURAL FOREST EXPLORER</p></div></header>
  <div class="intro"><span class="eyebrow">LANDSCAPE 001</span><h2>A forest, by nature.</h2><p>Explore the quiet rules that shape a living landscape.</p></div>
  <section><div class="section-title"><h3>Terrain & growth</h3><span>01</span></div>
    <label class="field">World seed <input id="seed" type="number" value="7421" min="0" max="999999999" step="1" /></label>
    <label class="slider">Forest extent <output id="size-value"></output><input id="size" type="range" min="120" max="600" step="40" value="280"/><span>Intimate</span><span>Expansive</span></label>
    <label class="slider">Tree density <output id="density-value"></output><input id="density" type="range" min="0.1" max="1" step="0.05" value="0.75"/><span>Open woodland</span><span>Dense forest</span></label>
    <label class="slider">Terrain relief <output id="relief-value"></output><input id="relief" type="range" min="15" max="110" step="5" value="65"/></label>
    <label class="slider">Erosion <output id="erosion-value"></output><input id="erosion" type="range" min="0" max="1" step="0.05" value="0.65"/><span>Unweathered</span><span>Carved gullies</span></label>
    <label class="slider">Maximum slope <output id="slopeLimit-value"></output><input id="slopeLimit" type="range" min="10" max="45" step="1" value="30"/></label>
    <label class="slider">Root uplift <output id="roots-value"></output><input id="roots" type="range" min="0" max="1.5" step="0.1" value="0.6"/></label>
    <label class="toggle"><span>Understory foliage<small>Shade-loving ferns & bushes</small></span><input id="foliage" type="checkbox" checked /></label>
    <label class="slider">Tree billboard distance <output id="treeBillboardDistance-value"></output><input id="treeBillboardDistance" type="range" min="40" max="600" step="10" value="${DEFAULT_DISTANCES.treeBillboardDistance}"/></label>
    <label class="slider">Foliage culling distance <output id="foliageCullDistance-value"></output><input id="foliageCullDistance" type="range" min="20" max="300" step="10" value="${DEFAULT_DISTANCES.foliageCullDistance}"/></label>
    <p class="muted">Distances update instantly. Trees fade into captured side & top views; grass, ferns & bushes fade out near the foliage distance.</p>
    <button id="generate" class="primary">Regenerate landscape <span>↗</span></button>
    <div class="actions"><button id="randomize">⤨ Random seed</button><button id="export">↓ Export settings</button></div>
  </section>
  <section><div class="section-title"><h3>Light & depth</h3><span>02</span></div>
    <label class="slider">Sun intensity <output id="sun-intensity-value">${DEFAULT_LIGHTING.sunIntensity.toFixed(1)}</output><input id="sun-intensity" type="range" min="0" max="4" step="0.1" value="${DEFAULT_LIGHTING.sunIntensity}"/><span>Off</span><span>Bright</span></label>
    <label class="toggle"><span>Sun shadows<small>Terrain, trees & bushes</small></span><input id="shadows" type="checkbox" checked /></label>
    <label class="field">Shadow detail<select id="shadow-resolution"><option value="1024">Low · 1K</option><option value="2048" selected>Balanced · 2K</option><option value="4096">High · 4K</option></select></label>
    <label class="toggle"><span>Ambient occlusion<small id="ao-note">Contact depth in branches & gullies</small></span><input id="ao" type="checkbox" checked /></label>
    <label class="slider">Occlusion strength <output id="ao-strength-value">${DEFAULT_LIGHTING.aoStrength}</output><input id="ao-strength" type="range" min="0.2" max="2.5" step="0.1" value="${DEFAULT_LIGHTING.aoStrength}"/></label>
    <label class="slider">Atmospheric haze <output id="haze-value">${DEFAULT_LIGHTING.haze * 100}%</output><input id="haze" type="range" min="0" max="1" step="0.05" value="${DEFAULT_LIGHTING.haze}"/><span>Clear</span><span>Misty</span></label>
    <label class="field">Haze color <input id="haze-color" type="color" value="${DEFAULT_LIGHTING.hazeColor}" /></label>
    <p class="muted">Lighting updates instantly. Lower shadow detail or turn off occlusion for more performance.</p>
  </section>
  <section><div class="section-title"><h3>Ground & grass</h3><span>03</span></div>
    <p class="muted">Deep woodland greens with earthy shade and stone. Colors appear in Natural view.</p>
    ${[['groundColor', 'Ground color'], ['litterColor', 'Forest litter color'], ['rockColor', 'Rock color'], ['grassColor', 'Grass color']].map(([key, label]) => `<label class="field">${label}<input id="${key}" type="color" value="${DEFAULT_MATERIALS[key]}" /></label>`).join('')}
    ${[['groundRoughness', 'Ground roughness'], ['grassRoughness', 'Grass roughness']].map(([key, label]) => `<label class="slider">${label}<output id="${key}-value">${DEFAULT_MATERIALS[key].toFixed(2)}</output><input id="${key}" type="range" min="0.1" max="1" step="0.05" value="${DEFAULT_MATERIALS[key]}"/><span>Smooth</span><span>Matte</span></label>`).join('')}
    <button id="reset-materials" class="primary">Reset woodland materials</button>
    <p class="muted">Updates instantly without regenerating. Grass color affects the grass blades; ground colors blend with shade, slope, and erosion.</p>
  </section>
  <section><div class="section-title"><h3>Tree library</h3><span>04</span></div><p class="muted">Demo trees load automatically. Each model gets its own side & top billboard captures. Replace either habitat with your own static GLB.</p>
    <label class="model"><span class="tree-symbol">♠</span><span><strong>Forest edge</strong><small id="edge-name">Full, low-reaching canopy</small></span><span class="upload">＋</span><input id="edge-file" type="file" accept=".glb" aria-label="Import forest edge GLB"/></label>
    <label class="model"><span class="tree-symbol">♠</span><span><strong>Forest interior</strong><small id="core-name">High crown & dead branches</small></span><span class="upload">＋</span><input id="core-file" type="file" accept=".glb" aria-label="Import forest interior GLB"/></label>
  </section>
  <footer><span class="dot"></span> BABYLON.JS <span>SEEDED · INSTANCED</span></footer>
</aside>
<main><canvas id="viewport" aria-label="Interactive procedurally generated pine forest"></canvas>
  <div class="view-header"><div><span class="eyebrow">LIVE ENVIRONMENT</span><h2>Alpine woodland <span id="seed-label">/ 7421</span></h2></div><div class="live"><i></i><span id="fps">— FPS</span></div></div>
  <nav class="view-modes" aria-label="Terrain visualization"><button data-mode="natural" class="active">Natural</button><button data-mode="slope">Slope</button><button data-mode="shade">Canopy shade</button></nav>
  <div class="view-tools"><button id="home" title="Reset camera" aria-label="Reset camera">⌂</button><button id="top" title="Top view" aria-label="Top view">⊞</button></div>
  <div id="status" role="status">Growing your forest…</div>
  <div class="legend" id="legend"><span class="dot"></span> Altitude-adapted pines <span class="legend-divider">/</span> Natural ground cover</div>
  <div class="bottom"><div class="stats"><div><strong id="tree-count">—</strong><span>TREES</span></div><div><strong id="edge-count">—</strong><span>EDGE / INTERIOR</span></div><div><strong id="plant-count">—</strong><span>UNDERSTORY</span></div><div><strong id="batch-count">—</strong><span>INSTANCE BATCHES</span></div></div><p>Drag to orbit <span>·</span> Scroll to explore <span>·</span> Right-drag to pan</p></div>
</main>`;

const $ = id => document.getElementById(id);
const units = { size: v => `${v} m`, density: v => `${Math.round(v * 100)}%`, relief: v => `${v} m`, erosion: v => `${Math.round(v * 100)}%`, slopeLimit: v => `${v}°`, roots: v => `${Number(v).toFixed(1)} m` };
Object.entries(units).forEach(([id, format]) => { const update = () => { $(`${id}-value`).value = format($(id).value); }; $(id).addEventListener('input', update); update(); });
let renderer, data, config, mode = 'natural', busy = false;
const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); $('status').hidden = !message; };
const readConfig = () => ({ seed: Math.abs(Math.trunc(Number($('seed').value) || 0)) % 1000000000, ...Object.fromEntries(Object.keys(units).map(k => [k, Number($(k).value)])), foliage: $('foliage').checked });
const readDistances = () => Object.fromEntries(Object.keys(DEFAULT_DISTANCES).map(key => [key, Number($(key).value)]));
for (const key of Object.keys(DEFAULT_DISTANCES)) {
  const update = () => { $(`${key}-value`).value = `${$(key).value} m`; renderer?.setDistances(readDistances()); };
  $(key).addEventListener('input', update); update();
}
function displayStats() { $('tree-count').textContent = data.trees.length.toLocaleString(); const edge = data.trees.filter(t => t.edge).length; $('edge-count').textContent = `${edge.toLocaleString()} / ${(data.trees.length - edge).toLocaleString()}`; $('plant-count').textContent = config.foliage ? data.foliage.length.toLocaleString() : '0'; $('batch-count').textContent = renderer.batches.toLocaleString(); $('seed-label').textContent = `/ ${config.seed}`; }
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
async function generate(reset = false) { if (busy || !renderer) return; busy = true; $('generate').disabled = true; status('Growing your forest…'); await nextFrame(); try { config = readConfig(); data = makeForest(config); renderer.rebuild(data, config, mode); if (reset) renderer.home(config.size, config.relief); displayStats(); status(''); } catch (error) { console.error(error); status(error.message, true); } finally { busy = false; $('generate').disabled = false; } }
$('generate').onclick = () => generate();
$('randomize').onclick = () => { $('seed').value = Math.floor(Math.random() * 999999); generate(); };
$('home').onclick = () => renderer?.home(config.size, config.relief);
$('top').onclick = () => renderer?.top();
const readLighting = () => ({ sunIntensity: Number($('sun-intensity').value), shadows: $('shadows').checked, ao: $('ao').checked, aoStrength: Number($('ao-strength').value), shadowResolution: Number($('shadow-resolution').value), haze: Number($('haze').value), hazeColor: $('haze-color').value });
const readMaterials = () => Object.fromEntries(Object.entries(DEFAULT_MATERIALS).map(([key, value]) => [key, typeof value === 'number' ? Number($(key).value) : $(key).value]));
function updateMaterials() {
  for (const key of ['groundRoughness', 'grassRoughness']) $(`${key}-value`).value = Number($(key).value).toFixed(2);
  try { renderer?.setMaterials(readMaterials()); } catch (error) { console.error(error); status(`Material update failed: ${error.message}`, true); }
}
for (const key of Object.keys(DEFAULT_MATERIALS)) $(key).addEventListener('input', updateMaterials);
$('reset-materials').onclick = () => {
  for (const [key, value] of Object.entries(DEFAULT_MATERIALS)) $(key).value = value;
  updateMaterials();
};
for (const id of ['sun-intensity', 'shadows', 'ao', 'ao-strength', 'shadow-resolution', 'haze', 'haze-color']) $(id).addEventListener('input', () => {
  $('sun-intensity-value').value = Number($('sun-intensity').value).toFixed(1);
  $('haze-value').value = `${Math.round(Number($('haze').value) * 100)}%`;
  $('ao-strength-value').value = Number($('ao-strength').value).toFixed(1);
  $('ao-strength').disabled = !$('ao').checked;
  $('shadow-resolution').disabled = !$('shadows').checked;
  try { renderer?.setLighting(readLighting()); } catch (error) { console.error(error); status(`Lighting update failed: ${error.message}`, true); }
});
document.querySelectorAll('[data-mode]').forEach(button => { button.onclick = async () => { if (!data || busy) return; busy = true; mode = button.dataset.mode; document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b === button)); status('Updating terrain view…'); await nextFrame(); try { renderer.rebuild(data, config, mode); $('legend').textContent = mode === 'slope' ? `Green: plantable · Terracotta: steeper than ${config.slopeLimit}°` : mode === 'shade' ? 'Gold: open sunlight · Teal: canopy shade' : 'Altitude-adapted pines / Natural ground cover'; status(''); } catch (error) { status(error.message, true); } finally { busy = false; } }; });
for (const kind of ['edge', 'core']) $(`${kind}-file`).onchange = async event => { const file = event.target.files[0]; if (!file || !renderer || busy) return; busy = true; status(`Loading ${file.name}…`); try { await renderer.loadModel(file, kind); renderer.rebuild(data, config, mode); $(`${kind}-name`).textContent = file.name; displayStats(); status(''); } catch (error) { console.error(error); status(`GLB import failed: ${error.message}`, true); } finally { busy = false; event.target.value = ''; } };
$('export').onclick = () => { if (!config) return; const url = URL.createObjectURL(new Blob([JSON.stringify({ ...config, distances: readDistances(), lighting: readLighting(), materials: readMaterials() }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `pinefield-${config.seed}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
async function start() {
  try {
    renderer = createRenderer($('viewport'));
    renderer.setDistances(readDistances());
    if (!renderer.aoSupported) { $('ao').checked = false; $('ao').disabled = true; $('ao-strength').disabled = true; $('ao-note').textContent = 'Requires WebGL 2 with multiple render targets'; }
    renderer.setLighting(readLighting());
    renderer.setMaterials(readMaterials());
    status('Loading your demo trees…');
    busy = true;
    const models = [
      { url: edgeTreeUrl, kind: 'edge', name: 'tree_edge_demo.glb' },
      { url: interiorTreeUrl, kind: 'core', name: 'tree_interior_demo.glb' },
    ];
    const failures = [];
    for (const model of models) {
      try { await renderer.loadModel(model.url, model.kind); $(`${model.kind}-name`).textContent = model.name; }
      catch (error) { console.error(error); failures.push(model.name); }
    }
    busy = false;
    await generate(true);
    if (failures.length) status(`Using blockouts: could not load ${failures.join(', ')}`, true);
    setInterval(() => { $('fps').textContent = `${Math.round(renderer.engine.getFps())} FPS`; }, 1000);
  } catch (error) { busy = false; console.error(error); status(`Unable to start the 3D view: ${error.message}`, true); }
}
start();

