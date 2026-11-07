"""Generate a self-contained skeletal-rig demo page (rig.json + part PNGs
inlined as base64) for the SCRAP DUNGEON scout."""
import json, os, base64
from PIL import Image

ROOT = '/home/hatch/workspace/scrap-dungeon/research/skeletal'
rig = json.load(open(os.path.join(ROOT, 'rig.json')))
PARTS = os.path.join(ROOT, 'parts')

imgs = {}
for g in rig['groups']:
    for d in rig['dirs']:
        p = os.path.join(PARTS, g, f'{d}.png')
        imgs[f'{g}|{d}'] = 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()

html = '''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SCRAP DUNGEON skeletal rig demo</title>
<style>
body{background:#181820;color:#eee;font-family:monospace;text-align:center}
canvas{background:#000;image-rendering:pixelated;border:1px solid #444}
button{margin:2px;padding:6px 10px;background:#2a2a3a;color:#eee;border:1px solid #555;cursor:pointer}
button.on{background:#2f5fd0}
</style></head><body>
<h2>Scout skeletal rig (2D bones, interpolated keyframes)</h2>
<canvas id="c" width="384" height="384"></canvas>
<div id="dirs"></div><div id="states"></div>
<div><input id="scrub" type="range" min="0" max="1000" value="0" style="width:384px">
<button id="play">pause</button> <span id="info"></span></div>
<script>
const RIG = __RIG__;
const IMG = __IMG__;
const ORDER = ['legL','legR','torso','head','armL','armR'];
const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
let dir = 'S', state = 'walk', playing = true, t0 = performance.now(), scrub = -1;
const cache = {};
function img(g, d){ const k = g+'|'+d; if(!cache[k]){ const i = new Image(); i.src = IMG[k]; cache[k] = i; } return cache[k]; }
// keyframe tracks: [time, {part: angle}] + torso translate tracks
const TRACKS = {
  idle:   { keys: [[0, {}]], dur: 1, bob: (t)=>Math.sin(t*Math.PI*2)*1 },
  walk:   { keys: [[0,   {legL:22, legR:-22, armL:-16, armR:16}],
                   [0.5, {legL:-22, legR:22, armL:16, armR:-16}],
                   [1,   {legL:22, legR:-22, armL:-16, armR:16}]], dur: 1,
           bob: (t)=>-Math.abs(Math.sin(t*Math.PI*2))*1.5 },
  attack: { keys: [[0, {armR:0}], [0.21, {armR:-12}], [0.43, {armR:55}],
                   [0.86, {armR:0}]], dur: 0.7, lunge: (t)=> t>0.21&&t<0.6 ? 2 : 0 },
  damaged:{ keys: [[0, {torso:-8, head:-6, armL:12, armR:-12}]], dur: 1 },
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
  const tr = TRACKS[state];
  let t = scrub >= 0 ? scrub : ((performance.now() - t0) / 1000 % tr.dur) / tr.dur;
  const angles = poseAt(tr, t);
  ctx.clearRect(0, 0, 384, 384);
  ctx.save(); ctx.scale(4, 4);
  const bob = tr.bob ? tr.bob(t) : 0, lunge = tr.lunge ? tr.lunge(t) : 0;
  // torso root (bob + lunge), children inherit via nested transforms
  ctx.save();
  ctx.translate(0, bob + lunge);
  const tp = RIG.groups.torso.pivots[dir];
  ctx.translate(tp[0], tp[1]); ctx.rotate((angles.torso||0)*Math.PI/180); ctx.translate(-tp[0], -tp[1]);
  for (const g of ORDER){
    const im = img(g, dir);
    if (g === 'torso'){ ctx.drawImage(im, 0, 0); continue; }
    const p = RIG.groups[g].pivots[dir];
    ctx.save();
    ctx.translate(p[0], p[1]); ctx.rotate((angles[g]||0)*Math.PI/180); ctx.translate(-p[0], -p[1]);
    ctx.drawImage(im, 0, 0);
    ctx.restore();
  }
  ctx.restore(); ctx.restore();
  document.getElementById('info').textContent = dir + ' / ' + state + ' / t=' + t.toFixed(2);
  if (playing && scrub < 0) requestAnimationFrame(draw);
}
RIG.dirs.forEach(d => { const b = document.createElement('button'); b.textContent = d;
  b.onclick = () => { dir = d; document.querySelectorAll('#dirs button').forEach(x => x.classList.toggle('on', x.textContent === d)); draw(); };
  if (d === dir) b.classList.add('on'); document.getElementById('dirs').appendChild(b); });
Object.keys(TRACKS).forEach(s => { const b = document.createElement('button'); b.textContent = s;
  b.onclick = () => { state = s; t0 = performance.now(); document.querySelectorAll('#states button').forEach(x => x.classList.toggle('on', x.textContent === s)); if (!playing) draw(); };
  if (s === state) b.classList.add('on'); document.getElementById('states').appendChild(b); });
document.getElementById('play').onclick = (e) => { playing = !playing; e.target.textContent = playing ? 'pause' : 'play'; if (playing){ t0 = performance.now(); draw(); } };
document.getElementById('scrub').oninput = (e) => { scrub = e.target.value / 1000; draw(); };
document.getElementById('scrub').onchange = (e) => { scrub = -1; t0 = performance.now(); if (playing) draw(); };
draw();
</script></body></html>'''
html = html.replace('__RIG__', json.dumps(rig)).replace('__IMG__', json.dumps(imgs))
open(os.path.join(ROOT, 'demo.html'), 'w').write(html)
print('demo.html written,', len(html), 'bytes')
