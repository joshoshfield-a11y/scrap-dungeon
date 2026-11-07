"""Combined skeletal-rig demo for all 5 SCRAP DUNGEON combatants.
Self-contained: every rig.json + part PNG inlined as base64.
Flat FK (all children of the root), same as the scout demo; the drone's
root is 'body' and its walk state is a hover bob with a spinning rotor."""
import json, os, base64

ROOT = '/home/hatch/workspace/scrap-dungeon/research/skeletal'
MODELS = {
    'scout':  ('biped', os.path.join(ROOT, 'rig.json'), os.path.join(ROOT, 'parts')),
    'raider': ('biped', os.path.join(ROOT, 'rigs', 'raider', 'rig.json'), os.path.join(ROOT, 'rigs', 'raider', 'parts')),
    'brute':  ('biped', os.path.join(ROOT, 'rigs', 'brute', 'rig.json'), os.path.join(ROOT, 'rigs', 'brute', 'parts')),
    'drone':  ('drone', os.path.join(ROOT, 'rigs', 'drone', 'rig.json'), os.path.join(ROOT, 'rigs', 'drone', 'parts')),
    'boss':   ('biped', os.path.join(ROOT, 'rigs', 'boss', 'rig.json'), os.path.join(ROOT, 'rigs', 'boss', 'parts')),
}
ORDERS = {
    'biped': ['legL', 'legR', 'torso', 'head', 'armL', 'armR'],
    'drone': ['skid', 'body', 'armL', 'armR', 'rotor'],
}
ROOTS = {'biped': 'torso', 'drone': 'body'}

rigs, imgs = {}, {}
for name, (kind, rig_path, parts) in MODELS.items():
    rig = json.load(open(rig_path))
    rigs[name] = {'kind': kind, 'rig': rig, 'order': ORDERS[kind], 'root': ROOTS[kind]}
    for g in rig['groups']:
        for d in rig['dirs']:
            p = os.path.join(parts, g, f'{d}.png')
            imgs[f'{name}|{g}|{d}'] = 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()

html = '''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SCRAP DUNGEON skeletal rigs — all 5</title>
<style>
body{background:#181820;color:#eee;font-family:monospace;text-align:center}
canvas{background:#000;image-rendering:pixelated;border:1px solid #444}
button{margin:2px;padding:6px 10px;background:#2a2a3a;color:#eee;border:1px solid #555;cursor:pointer}
button.on{background:#2f5fd0}
</style></head><body>
<h2>SCRAP DUNGEON skeletal rigs (2D bones, interpolated keyframes)</h2>
<canvas id="c" width="384" height="384"></canvas>
<div id="models"></div><div id="dirs"></div><div id="states"></div>
<div><input id="scrub" type="range" min="0" max="1000" value="0" style="width:384px">
<button id="play">pause</button> <span id="info"></span></div>
<script>
const RIGS = __RIGS__;
const IMG = __IMG__;
const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
let model = 'scout', dir = 'S', state = 'walk', playing = true, t0 = performance.now(), scrub = -1;
const cache = {};
function img(m, g, d){ const k = m+'|'+g+'|'+d; if(!cache[k]){ const i = new Image(); i.src = IMG[k]; cache[k] = i; } return cache[k]; }
const BIPED = {
  idle:   { keys: [[0, {}]], dur: 1, bob: (t)=>Math.sin(t*Math.PI*2)*1 },
  walk:   { keys: [[0,   {legL:22, legR:-22, armL:-16, armR:16}],
                   [0.5, {legL:-22, legR:22, armL:16, armR:-16}],
                   [1,   {legL:22, legR:-22, armL:-16, armR:16}]], dur: 1,
           bob: (t)=>-Math.abs(Math.sin(t*Math.PI*2))*1.5 },
  attack: { keys: [[0, {armR:0}], [0.21, {armR:-12}], [0.43, {armR:55}],
                   [0.86, {armR:0}]], dur: 0.7, lunge: (t)=> t>0.21&&t<0.6 ? 2 : 0 },
  damaged:{ keys: [[0, {torso:-8, head:-6, armL:12, armR:-12}]], dur: 1 },
};
const DRONE = {
  idle:   { keys: [[0, {rotor:0}]], dur: 1, bob: (t)=>Math.sin(t*Math.PI*2)*1.5 },
  walk:   { keys: [[0, {rotor:0}], [1, {rotor:360}]], dur: 0.8,
           bob: (t)=>-Math.abs(Math.sin(t*Math.PI*2))*1.5 },
  attack: { keys: [[0, {rotor:0}], [0.43, {rotor:180}], [0.86, {rotor:360}]], dur: 0.7,
           lunge: (t)=> t>0.21&&t<0.6 ? 2 : 0 },
  damaged:{ keys: [[0, {body:-12, rotor:0}]], dur: 1 },
};
function smooth(a, b, u){ u = u*u*(3-2*u); const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = (a[k]||0) + ((b[k]||0)-(a[k]||0))*u; return o; }
function poseAt(tr, t){
  const keys = tr.keys;
  if (keys.length === 1) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++){
    if (t >= keys[i][0] && t <= keys[i+1][0]){
      const u = (t - keys[i][0]) / (keys[i+1][0] - keys[i][0]);
      // rotor spins linearly, not smoothstepped, or it stalls at the ends
      if (keys[i][1].rotor !== undefined && keys[i+1][1].rotor !== undefined)
        return { rotor: keys[i][1].rotor + (keys[i+1][1].rotor - keys[i][1].rotor) * u };
      return smooth(keys[i][1], keys[i+1][1], u);
    }
  }
  return keys[keys.length-1][1];
}
function draw(){
  const M = RIGS[model], RIG = M.rig;
  const tr = (M.kind === 'drone' ? DRONE : BIPED)[state];
  let t = scrub >= 0 ? scrub : ((performance.now() - t0) / 1000 % tr.dur) / tr.dur;
  const angles = poseAt(tr, t);
  ctx.clearRect(0, 0, 384, 384);
  ctx.save(); ctx.scale(4, 4);
  const bob = tr.bob ? tr.bob(t) : 0, lunge = tr.lunge ? tr.lunge(t) : 0;
  ctx.save();
  ctx.translate(0, bob + lunge);
  const root = M.root;
  const tp = RIG.groups[root].pivots[dir];
  ctx.translate(tp[0], tp[1]); ctx.rotate((angles[root]||0)*Math.PI/180); ctx.translate(-tp[0], -tp[1]);
  for (const g of M.order){
    const im = img(model, g, dir);
    if (g === root){ ctx.drawImage(im, 0, 0); continue; }
    const p = RIG.groups[g].pivots[dir];
    ctx.save();
    ctx.translate(p[0], p[1]); ctx.rotate((angles[g]||0)*Math.PI/180); ctx.translate(-p[0], -p[1]);
    ctx.drawImage(im, 0, 0);
    ctx.restore();
  }
  ctx.restore(); ctx.restore();
  document.getElementById('info').textContent = model + ' / ' + dir + ' / ' + state + ' / t=' + t.toFixed(2);
  if (playing && scrub < 0) requestAnimationFrame(draw);
}
function mkRow(id, items, cur, fn){
  const el = document.getElementById(id);
  items.forEach(v => { const b = document.createElement('button'); b.textContent = v;
    b.onclick = () => { fn(v); document.querySelectorAll('#'+id+' button').forEach(x => x.classList.toggle('on', x.textContent === v)); if (!playing) draw(); };
    if (v === cur) b.classList.add('on'); el.appendChild(b); });
}
mkRow('models', Object.keys(RIGS), model, v => { model = v; t0 = performance.now(); });
mkRow('dirs', RIGS[model].rig.dirs, dir, v => { dir = v; });
mkRow('states', ['idle','walk','attack','damaged'], state, v => { state = v; t0 = performance.now(); });
document.getElementById('play').onclick = (e) => { playing = !playing; e.target.textContent = playing ? 'pause' : 'play'; if (playing){ t0 = performance.now(); draw(); } };
document.getElementById('scrub').oninput = (e) => { scrub = e.target.value / 1000; draw(); };
document.getElementById('scrub').onchange = (e) => { scrub = -1; t0 = performance.now(); if (playing) draw(); };
draw();
</script></body></html>'''
html = html.replace('__RIGS__', json.dumps(rigs)).replace('__IMG__', json.dumps(imgs))
out = os.path.join(ROOT, 'demo_all.html')
open(out, 'w').write(html)
print('demo_all.html written,', len(html), 'bytes')
