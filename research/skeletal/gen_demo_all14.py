"""Generate a self-contained demo for ALL 14 skeletal rigs (scout top-level
+ 5 from rigs/ pass 1 + 9 from rigs/ pass 2). Generic root: each model's
root group is read from its rig.json, and all other groups are flat
children of that root, so root bob/lean/lunge inherit correctly.
Tracks are per kind; a track key for a group a model lacks is ignored.
Flyer/drone rotors are NOT spun 360 in this demo: a flat rotor plate
rotated in-plane is a tilt, not a spin — hover bob + tilt only.
Turret scan rotates dome and barrel together so they stay aligned."""
import json, os, base64

ROOT = '/home/hatch/workspace/scrap-dungeon/research/skeletal'
ORDERS = {
    'scout': ['legL', 'legR', 'torso', 'head', 'armL', 'armR'],
    'raider': ['legL', 'legR', 'torso', 'head', 'armL', 'armR'],
    'brute': ['legL', 'legR', 'torso', 'head', 'armL', 'armR'],
    'drone': ['skid', 'body', 'armL', 'armR', 'rotor'],
    'boss': ['legL', 'legR', 'torso', 'head', 'armL', 'armR'],
    'assault': ['legL', 'legR', 'torso', 'head', 'armL', 'armR'],
    'artillery': ['legL', 'legR', 'torso', 'cannon', 'head'],
    'tank': ['trackL', 'trackR', 'hull', 'turret'],
    'spider': ['legLB', 'legLM', 'legLF', 'legRB', 'legRM', 'legRF', 'body'],
    'turret': ['base', 'dome', 'barrel'],
    'flyer': ['hull', 'gun', 'rotor'],
    'shielder': ['legL', 'legR', 'torso', 'shield', 'head', 'armR'],
    'sniper': ['legL', 'legR', 'torso', 'head', 'armL', 'armR'],
    'bomber': ['legL', 'legR', 'body', 'head', 'armL', 'armR'],
}
KINDS = {'scout': 'biped', 'raider': 'biped', 'brute': 'biped', 'boss': 'biped',
         'assault': 'biped', 'sniper': 'biped', 'shielder': 'biped', 'bomber': 'biped',
         'drone': 'drone', 'artillery': 'artillery', 'tank': 'tank', 'spider': 'spider',
         'turret': 'turret', 'flyer': 'flyer'}
ROOTS = {'scout': 'torso', 'raider': 'torso', 'brute': 'torso', 'drone': 'body',
         'boss': 'torso', 'assault': 'torso', 'artillery': 'torso', 'tank': 'hull',
         'spider': 'body', 'turret': 'base', 'flyer': 'hull', 'shielder': 'torso',
         'sniper': 'torso', 'bomber': 'body'}

models = {}
for name, order in ORDERS.items():
    if name == 'scout':
        rig = json.load(open(os.path.join(ROOT, 'rig.json')))
        parts = os.path.join(ROOT, 'parts')
    else:
        rig = json.load(open(os.path.join(ROOT, 'rigs', name, 'rig.json')))
        parts = os.path.join(ROOT, 'rigs', name, 'parts')
    imgs = {}
    for g in rig['groups']:
        for d in rig['dirs']:
            p = os.path.join(parts, g, f'{d}.png')
            imgs[f'{g}|{d}'] = 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
    models[name] = {'rig': rig, 'imgs': imgs, 'order': order,
                    'kind': KINDS[name], 'root': ROOTS[name]}

html = '''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SCRAP DUNGEON — all 14 skeletal rigs</title>
<style>
body{background:#181820;color:#eee;font-family:monospace;text-align:center}
canvas{background:#000;image-rendering:pixelated;border:1px solid #444}
button{margin:2px;padding:6px 10px;background:#2a2a3a;color:#eee;border:1px solid #555;cursor:pointer}
button.on{background:#2f5fd0}
select{padding:6px;background:#2a2a3a;color:#eee;border:1px solid #555;font-family:monospace}
</style></head><body>
<h2>SCRAP DUNGEON — all 14 skeletal rigs (2D bones, interpolated keyframes)</h2>
<canvas id="c" width="384" height="384"></canvas>
<div><select id="model"></select></div>
<div id="dirs"></div><div id="states"></div>
<div><input id="scrub" type="range" min="0" max="1000" value="0" style="width:384px">
<button id="play">pause</button> <span id="info"></span></div>
<p style="color:#888">walk = legs / hover / scan / drive per body plan. Flyer/drone rotors tilt, they do not spin in-plane. Turret scan moves dome+barrel together.</p>
<script>
const MODELS = __MODELS__;
const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
let model = 'scout', dir = 'S', state = 'walk', playing = true, t0 = performance.now(), scrub = -1;
const cache = {};
function img(g, d){ const k = model + '|' + g + '|' + d; if(!cache[k]){ const i = new Image(); i.src = MODELS[model].imgs[g+'|'+d]; cache[k] = i; } return cache[k]; }
const BIPED_WALK = [[0, {legL:22, legR:-22, armL:-16, armR:16, shield:8}], [0.5, {legL:-22, legR:22, armL:16, armR:-16, shield:-8}], [1, {legL:22, legR:-22, armL:-16, armR:16, shield:8}]];
const TRACKS = {
  biped: {
    idle: { keys: [[0, {}]], dur: 1, bob: (t)=>Math.sin(t*Math.PI*2)*1 },
    walk: { keys: BIPED_WALK, dur: 1, bob: (t)=>-Math.abs(Math.sin(t*Math.PI*2))*1.5 },
    attack: { keys: [[0, {armR:0, shield:0}], [0.21, {armR:-12}], [0.43, {armR:55, shield:-10}], [0.86, {armR:0, shield:0}]], dur: 0.7, lunge: (t)=> t>0.21&&t<0.6 ? 2 : 0 },
    damaged: { keys: [[0, {torso:-8, body:-8, head:-6, armL:12, armR:-12, shield:15}]], dur: 1 },
  },
  artillery: {
    idle: { keys: [[0, {}]], dur: 1, bob: (t)=>Math.sin(t*Math.PI*2)*1 },
    walk: { keys: [[0, {legL:22, legR:-22}], [0.5, {legL:-22, legR:22}], [1, {legL:22, legR:-22}]], dur: 1, bob: (t)=>-Math.abs(Math.sin(t*Math.PI*2))*1.5 },
    attack: { keys: [[0, {cannon:0}], [0.3, {cannon:-15}], [0.7, {cannon:0}]], dur: 0.7, lunge: (t)=> t>0.21&&t<0.6 ? 2 : 0 },
    damaged: { keys: [[0, {torso:-8, head:-6, cannon:10}]], dur: 1 },
  },
  tank: {
    idle: { keys: [[0, {}]], dur: 1 },
    walk: { keys: [[0, {turret:12}], [0.5, {turret:-12}], [1, {turret:12}]], dur: 2, bob: (t)=>-Math.abs(Math.sin(t*Math.PI*2))*0.5 },
    attack: { keys: [[0, {turret:0}], [0.3, {turret:0}], [0.7, {turret:0}]], dur: 0.7, lunge: (t)=> t>0.21&&t<0.6 ? 2 : 0 },
    damaged: { keys: [[0, {hull:-10}]], dur: 1 },
  },
  spider: {
    idle: { keys: [[0, {}]], dur: 1, bob: (t)=>Math.sin(t*Math.PI*2)*1 },
    walk: { keys: [[0, {legLF:18, legLM:-18, legLB:18, legRF:-18, legRM:18, legRB:-18}], [0.5, {legLF:-18, legLM:18, legLB:-18, legRF:18, legRM:-18, legRB:18}], [1, {legLF:18, legLM:-18, legLB:18, legRF:-18, legRM:18, legRB:-18}]], dur: 1, bob: (t)=>-Math.abs(Math.sin(t*Math.PI*2))*1.5 },
    attack: { keys: [[0, {legLF:0, legRF:0}], [0.3, {legLF:30, legRF:30}], [0.7, {legLF:0, legRF:0}]], dur: 0.7, lunge: (t)=> t>0.21&&t<0.6 ? 2 : 0 },
    damaged: { keys: [[0, {body:-8, legLF:-10, legRF:-10}]], dur: 1 },
  },
  turret: {
    idle: { keys: [[0, {}]], dur: 1 },
    walk: { keys: [[0, {dome:15, barrel:15}], [0.5, {dome:-15, barrel:-15}], [1, {dome:15, barrel:15}]], dur: 2 },
    attack: { keys: [[0, {barrel:0}], [0.3, {barrel:-20}], [0.7, {barrel:0}]], dur: 0.7 },
    damaged: { keys: [[0, {base:12}]], dur: 1 },
  },
  drone: {
    idle: { keys: [[0, {}]], dur: 1, bob: (t)=>Math.sin(t*Math.PI*2)*1.5 },
    walk: { keys: [[0, {}]], dur: 1, bob: (t)=>-Math.abs(Math.sin(t*Math.PI*2))*2 },
    attack: { keys: [[0, {rotor:0}], [0.3, {rotor:45}], [0.7, {rotor:0}]], dur: 0.7, lunge: (t)=> t>0.21&&t<0.6 ? 2 : 0 },
    damaged: { keys: [[0, {body:12}]], dur: 1 },
  },
  flyer: {
    idle: { keys: [[0, {}]], dur: 1, bob: (t)=>Math.sin(t*Math.PI*2)*1.5 },
    walk: { keys: [[0, {}]], dur: 1, bob: (t)=>-Math.abs(Math.sin(t*Math.PI*2))*2 },
    attack: { keys: [[0, {rotor:0}], [0.3, {rotor:20}], [0.7, {rotor:0}]], dur: 0.7, lunge: (t)=> t>0.21&&t<0.6 ? 2 : 0 },
    damaged: { keys: [[0, {hull:12}]], dur: 1 },
  },
};
function smooth(a, b, u){ u = u*u*(3-2*u); const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = (a[k]||0) + ((b[k]||0)-(a[k]||0))*u; return o; }
function poseAt(tr, t){
  const keys = tr.keys;
  if (keys.length === 1) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++){
    if (t >= keys[i][0] && t <= keys[i+1][0]){
      const u = (t - keys[i][0]) / (keys[i+1][0] - keys[i][0]);
      return smooth(keys[i][1], keys[i+1][1], u);
    }
  }
  return keys[keys.length-1][1];
}
function draw(){
  const M = MODELS[model], tr = TRACKS[M.kind][state];
  let t = scrub >= 0 ? scrub : ((performance.now() - t0) / 1000 % tr.dur) / tr.dur;
  const angles = poseAt(tr, t);
  ctx.clearRect(0, 0, 384, 384);
  ctx.save(); ctx.scale(4, 4);
  const bob = tr.bob ? tr.bob(t) : 0, lunge = tr.lunge ? tr.lunge(t) : 0;
  ctx.save();
  ctx.translate(0, bob + lunge);
  const root = M.root;
  const tp = M.rig.groups[root].pivots[dir];
  ctx.translate(tp[0], tp[1]); ctx.rotate((angles[root]||0)*Math.PI/180); ctx.translate(-tp[0], -tp[1]);
  for (const g of M.order){
    const im = img(g, dir);
    if (g === root){ ctx.drawImage(im, 0, 0); continue; }
    const p = M.rig.groups[g].pivots[dir];
    ctx.save();
    ctx.translate(p[0], p[1]); ctx.rotate((angles[g]||0)*Math.PI/180); ctx.translate(-p[0], -p[1]);
    ctx.drawImage(im, 0, 0);
    ctx.restore();
  }
  ctx.restore(); ctx.restore();
  document.getElementById('info').textContent = model + ' / ' + dir + ' / ' + state + ' / t=' + t.toFixed(2);
  if (playing && scrub < 0) requestAnimationFrame(draw);
}
const sel = document.getElementById('model');
Object.keys(MODELS).forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); });
sel.onchange = (e) => { model = e.target.value; t0 = performance.now(); draw(); };
MODELS[model].rig.dirs.forEach(d => { const b = document.createElement('button'); b.textContent = d;
  b.onclick = () => { dir = d; document.querySelectorAll('#dirs button').forEach(x => x.classList.toggle('on', x.textContent === d)); draw(); };
  if (d === dir) b.classList.add('on'); document.getElementById('dirs').appendChild(b); });
['idle','walk','attack','damaged'].forEach(s => { const b = document.createElement('button'); b.textContent = s;
  b.onclick = () => { state = s; t0 = performance.now(); document.querySelectorAll('#states button').forEach(x => x.classList.toggle('on', x.textContent === s)); if (!playing) draw(); };
  if (s === state) b.classList.add('on'); document.getElementById('states').appendChild(b); });
document.getElementById('play').onclick = (e) => { playing = !playing; e.target.textContent = playing ? 'pause' : 'play'; if (playing){ t0 = performance.now(); draw(); } };
document.getElementById('scrub').oninput = (e) => { scrub = e.target.value / 1000; draw(); };
document.getElementById('scrub').onchange = (e) => { scrub = -1; t0 = performance.now(); if (playing) draw(); };
draw();
</script></body></html>'''
html = html.replace('__MODELS__', json.dumps(models))
out = os.path.join(ROOT, 'demo_all14.html')
open(out, 'w').write(html)
print('demo_all14.html written,', len(html), 'bytes')
