"""Rig the remaining 9 articulated SCRAP DUNGEON characters, same proven
black-key method as build_rig.py / build_rig_all.py.

New in this pass: shape kinds are preserved (turret Dome and bomber
Bombs are 'ball' shapes, not boxes — rebuilding them as boxes would
change the render), and shielder/bomber are taken from the FIXED
build_scrap2_fix.py models (cyan emblem, widened bay), not the
original batch-2 versions, so the rig rest pose matches the shipped
sheets.

Models:
  assault:   mech_heavy_assault (wmechs, biped) — Shield -> armL, Gun -> armR
  artillery: mech_artillery (wmechs) — Breech+Cannon -> separate cannon group
  tank:      mech_tank_defender (wmechs) — Hull root, Turret+Gun, Tracks split
  spider:    mech_spider_walker (wmechs) — Body root, 6 legs (side x front/mid/back)
  turret:    mech_turret_light (scrap2) — Base root, Dome, Barrel
  flyer:     mech_flyer (scrap2) — Hull root, Rotor, Gun
  shielder:  mech_shielder (scrap2_fix) — Shield+Emblem separate, Arm R only
  sniper:    mech_sniper (scrap2) — Rifle/Stock/Scope -> armR, Pack -> torso
  bomber:    mech_bomber (scrap2_fix) — Body root, Bomb/Fuse split by side

Outputs under research/skeletal/rigs/<short>/, same layout as pass 1.
Resumable per model. Rest-pose composite must be 0 diff in all 8 dirs.
"""
import ast, json, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
from mcp_drive import Drive, DIRS

ROOT = '/home/hatch/workspace/scrap-dungeon/research/skeletal'
OUT = os.path.join(ROOT, 'rigs')
os.makedirs(OUT, exist_ok=True)
BLACK = '#000000'

def parse_colours_and_list(src, list_name):
    tree = ast.parse(open(src).read())
    colours, models = {}, None
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            t = node.targets[0]
            if isinstance(t, ast.Name) and isinstance(node.value, ast.Constant) \
                    and isinstance(node.value.value, str) and node.value.value.startswith('#'):
                colours[t.id] = node.value.value
            if isinstance(t, ast.Name) and t.id == list_name:
                models = node.value
    return colours, models

def shapes_from_model(elt, colours):
    """Return (glows, [(kind, frm, to, col, part), ...]) for one model elt."""
    glows = [colours[g.id] for g in elt.elts[1].elts]
    shapes = []
    for call in elt.elts[2].elts:
        a = call.args
        if call.func.id == 'box':
            frm = tuple(ast.literal_eval(a[0])); to = tuple(ast.literal_eval(a[1]))
            col = colours[a[2].id] if isinstance(a[2], ast.Name) else a[2].value
            shapes.append(('box', frm, to, col, a[3].value))
        elif call.func.id == 'shape':
            kind = a[0].value
            frm = tuple(ast.literal_eval(a[1])); to = tuple(ast.literal_eval(a[2]))
            col = colours[a[3].id] if isinstance(a[3], ast.Name) else a[3].value
            shapes.append((kind, frm, to, col, a[4].value))
        else:
            raise ValueError(f'unknown shape call {call.func.id}')
    return glows, shapes

def extract(src, list_name, model_name):
    colours, models = parse_colours_and_list(src, list_name)
    for elt in models.elts:
        if elt.elts[0].value == model_name:
            return shapes_from_model(elt, colours)
    raise ValueError(model_name)

WM = '/home/hatch/workspace/model-sprites/work/build_wmechs.py'
S2 = '/home/hatch/workspace/scrap-dungeon/build_scrap2.py'
S2F = '/home/hatch/workspace/scrap-dungeon/build_scrap2_fix.py'

def split(frm):
    return 'L' if frm[0] < 10 else 'R'

def g_assault(frm, part):
    if part == 'Feet': return 'legL' if split(frm) == 'L' else 'legR'
    if part == 'Leg L': return 'legL'
    if part == 'Leg R': return 'legR'
    if part == 'Torso': return 'torso'
    if part == 'Head': return 'head'
    if part == 'Arm L': return 'armL'
    if part == 'Arm R': return 'armR'
    if part == 'Gun': return 'armR'
    if part == 'Shield': return 'armL'
    raise ValueError(part)

def g_artillery(frm, part):
    if part == 'Feet': return 'legL' if split(frm) == 'L' else 'legR'
    if part == 'Leg L': return 'legL'
    if part == 'Leg R': return 'legR'
    if part == 'Torso': return 'torso'
    if part == 'Head': return 'head'
    if part in ('Breech', 'Cannon'): return 'cannon'
    raise ValueError(part)

def g_tank(frm, part):
    if part == 'Tracks': return 'trackL' if split(frm) == 'L' else 'trackR'
    if part in ('Hull', 'Spike'): return 'hull'
    if part in ('Turret', 'Gun'): return 'turret'
    raise ValueError(part)

def g_spider(frm, part):
    if part == 'Body': return 'body'
    if part == 'Leg':
        side = 'L' if split(frm) == 'L' else 'R'
        seg = {10: 'F', 8: 'M', 6: 'B'}[frm[2]]
        return f'leg{side}{seg}'
    raise ValueError(part)

def g_turret(frm, part):
    if part in ('Base', 'Bolt', 'Pedestal', 'Collar'): return 'base'
    if part in ('Dome', 'Eye', 'Vent', 'Antenna'): return 'dome'
    if part in ('Barrel', 'Muzzle'): return 'barrel'
    raise ValueError(part)

def g_flyer(frm, part):
    if part in ('Hull', 'Eye', 'Thruster', 'Pod', 'Fin', 'Antenna'): return 'hull'
    if part == 'Rotor': return 'rotor'
    if part in ('Gun', 'Muzzle'): return 'gun'
    raise ValueError(part)

def g_shielder(frm, part):
    if part == 'Feet': return 'legL' if split(frm) == 'L' else 'legR'
    if part == 'Leg L': return 'legL'
    if part == 'Leg R': return 'legR'
    if part == 'Knee': return 'legL' if split(frm) == 'L' else 'legR'
    if part in ('Torso', 'Chest', 'Core', 'Pauldron L', 'Pauldron R', 'Spike'): return 'torso'
    if part in ('Shield', 'Emblem'): return 'shield'
    if part in ('Arm R', 'Fist R'): return 'armR'
    if part in ('Head', 'Visor', 'Crest'): return 'head'
    raise ValueError(part)

def g_sniper(frm, part):
    if part == 'Feet': return 'legL' if split(frm) == 'L' else 'legR'
    if part == 'Leg L': return 'legL'
    if part == 'Leg R': return 'legR'
    if part in ('Torso', 'Vest', 'Pack'): return 'torso'
    if part == 'Arm L': return 'armL'
    if part in ('Arm R', 'Stock', 'Rifle', 'Muzzle', 'Scope'): return 'armR'
    if part in ('Head', 'Visor', 'Hood', 'Antenna'): return 'head'
    raise ValueError(part)

def g_bomber(frm, part):
    if part == 'Feet': return 'legL' if split(frm) == 'L' else 'legR'
    if part == 'Leg L': return 'legL'
    if part == 'Leg R': return 'legR'
    if part in ('Body', 'Belly', 'Bay', 'Core', 'Tank'): return 'body'
    if part in ('Arm L',): return 'armL'
    if part in ('Arm R',): return 'armR'
    if part == 'Bomb': return 'armL' if split(frm) == 'L' else 'armR'
    if part == 'Fuse': return 'armL' if split(frm) == 'L' else 'armR'
    if part in ('Head', 'Visor'): return 'head'
    raise ValueError(part)

BIPED = ['torso', 'head', 'armL', 'armR', 'legL', 'legR']
SPECS = {}
def add(short, src, lst, model, group_of, groups, root, centroid=()):
    glows, shapes = extract(src, lst, model)
    SPECS[short] = {'shapes': shapes, 'glows': glows, 'group_of': group_of,
                    'groups': groups, 'root': root, 'centroid': set(centroid)}
    print(f'{short}: {len(shapes)} shapes, glows {glows}, groups {groups}', flush=True)

add('assault', WM, 'MODELS', 'mech_heavy_assault', g_assault, BIPED, 'torso')
add('artillery', WM, 'MODELS', 'mech_artillery', g_artillery,
    ['torso', 'head', 'legL', 'legR', 'cannon'], 'torso')
add('tank', WM, 'MODELS', 'mech_tank_defender', g_tank,
    ['hull', 'turret', 'trackL', 'trackR'], 'hull', centroid=('turret',))
add('spider', WM, 'MODELS', 'mech_spider_walker', g_spider,
    ['body', 'legLF', 'legLM', 'legLB', 'legRF', 'legRM', 'legRB'], 'body')
add('turret', S2, 'ENEMIES', 'mech_turret_light', g_turret,
    ['base', 'dome', 'barrel'], 'base', centroid=('dome',))
add('flyer', S2, 'ENEMIES', 'mech_flyer', g_flyer,
    ['hull', 'rotor', 'gun'], 'hull', centroid=('rotor',))
add('shielder', S2F, 'FIXES', 'mech_shielder', g_shielder,
    ['torso', 'head', 'legL', 'legR', 'shield', 'armR'], 'torso')
add('sniper', S2, 'ENEMIES', 'mech_sniper', g_sniper, BIPED, 'torso')
add('bomber', S2F, 'FIXES', 'mech_bomber', g_bomber,
    ['body', 'head', 'armL', 'armR', 'legL', 'legR'], 'body')

def render_variant(d, outdir, name, shapes, group_of, group, glows):
    out = os.path.join(outdir, name)
    os.makedirs(out, exist_ok=True)
    variant = []
    for (kind, frm, to, col, part) in shapes:
        c = col if (group is None or group_of(frm, part) == group) else BLACK
        variant.append(('model_shape', {'shape': kind, 'from': list(frm), 'to': list(to), 'colour': c, 'part': part}))
    d.call('new_model', {})
    for tool, args in variant:
        d.call(tool, args)
    present = [g for g in glows if g in {a['colour'] for (_, a) in variant}]
    if present:
        d.call('model_colour', {'glow': {g: True for g in present}})
    d.call('render_model', {'into': 'new_sprite'})
    st = d.json_of(d.call('get_state', {}))
    paths = []
    import io, base64
    for i in range(st['frames']):
        d.call('select_frame', {'index': i})
        res = d.call('get_canvas_image', {})
        for c in res.get('content', []):
            if c.get('type') == 'image':
                fr = Image.open(io.BytesIO(base64.b64decode(c['data']))).convert('RGBA')
                fr = fr.resize((96, 96), Image.NEAREST)
                p = os.path.join(out, f'dir{i}.png')
                fr.save(p); paths.append(p)
    d.call('save_document', {'path': f'{out}/{name}_doc.pxl'})
    d.call('close_document', {})
    print(f'  {name}: {len(paths)} frames', flush=True)
    return paths

def key_part(frame_path):
    im = np.array(Image.open(frame_path).convert('RGBA')).astype(int)
    opaque = im[:, :, 3] > 0
    black = (im[:, :, 0] == 0) & (im[:, :, 1] == 0) & (im[:, :, 2] == 0)
    return opaque & ~black

def closest_joint(part_mask, parent_mask):
    py, px = np.where(part_mask)
    qy, qx = np.where(parent_mask)
    best = None
    for i in range(0, len(px), 256):
        dx = px[i:i+256, None] - qx[None, :]
        dy = py[i:i+256, None] - qy[None, :]
        d2 = dx*dx + dy*dy
        j = np.argmin(d2)
        k = i + j // d2.shape[1]
        if best is None or d2.flat[j] < best[0]:
            best = (d2.flat[j], int(px[k]), int(py[k]))
    return (best[1], best[2])

def build_one(d, short, cfg):
    mroot = os.path.join(OUT, short)
    frames_dir = os.path.join(mroot, 'frames')
    parts_dir = os.path.join(mroot, 'parts')
    os.makedirs(frames_dir, exist_ok=True); os.makedirs(parts_dir, exist_ok=True)
    groups, root, group_of = cfg['groups'], cfg['root'], cfg['group_of']
    variants = [f'{short}_full'] + [f'{short}_{g}' for g in groups]
    parts_complete = all(os.path.exists(os.path.join(parts_dir, g, f'{DIRS[i]}.png'))
                         for g in groups for i in range(8))
    frames_complete = all(os.path.exists(os.path.join(frames_dir, n, f'dir{i}.png'))
                          for n in variants for i in range(8))
    if parts_complete and frames_complete:
        print(f'{short}: parts + frames already on disk, skipping renders', flush=True)
        full = [os.path.join(frames_dir, f'{short}_full', f'dir{i}.png') for i in range(8)]
        var = {g: [os.path.join(frames_dir, f'{short}_{g}', f'dir{i}.png') for i in range(8)] for g in groups}
    else:
        full = render_variant(d, frames_dir, f'{short}_full', cfg['shapes'], group_of, None, cfg['glows'])
        var = {}
        for g in groups:
            var[g] = render_variant(d, frames_dir, f'{short}_{g}', cfg['shapes'], group_of, g, cfg['glows'])
    masks = {}
    full_ims = [np.array(Image.open(p).convert('RGBA')).astype(int) for p in full]
    for g in groups:
        masks[g] = [key_part(p) for p in var[g]]
    for i in range(8):
        coverage = np.zeros((96, 96), dtype=bool)
        for g in groups: coverage |= masks[g][i]
        residual = (full_ims[i][:, :, 3] > 0) & ~coverage
        if residual.any():
            ry, rx = np.where(residual)
            for (y, x) in zip(ry, rx):
                best_g, best_d2 = None, None
                for g in groups:
                    my, mx = np.where(masks[g][i])
                    if len(mx) == 0: continue
                    d2 = ((mx - x) ** 2 + (my - y) ** 2).min()
                    if best_d2 is None or d2 < best_d2: best_g, best_d2 = g, d2
                masks[best_g][i][y, x] = True
            print(f'  {short} dir {DIRS[i]}: residual px attributed: {int(residual.sum())}', flush=True)
    for g in groups:
        for i in range(8):
            spr = np.zeros_like(full_ims[i])
            spr[:, :, :3] = full_ims[i][:, :, :3]
            spr[:, :, 3] = np.where(masks[g][i], 255, 0)
            out = os.path.join(parts_dir, g); os.makedirs(out, exist_ok=True)
            Image.fromarray(spr.astype('uint8'), 'RGBA').save(os.path.join(out, f'{DIRS[i]}.png'))
    rig = {'cell': 96, 'dirs': DIRS, 'groups': {}}
    for g in groups:
        pivots = {}
        for i in range(8):
            if g == root:
                ys, xs = np.where(masks[g][i])
                pivots[DIRS[i]] = [int(xs.mean()), int(ys.max())]
            elif g in cfg['centroid']:
                ys, xs = np.where(masks[g][i])
                pivots[DIRS[i]] = [int(xs.mean()), int(ys.mean())] if len(xs) else [48, 48]
            elif masks[g][i].sum() == 0:
                ys, xs = np.where(masks[root][i])
                pivots[DIRS[i]] = [int(xs.mean()), int(ys.mean())]
            else:
                pivots[DIRS[i]] = list(closest_joint(masks[g][i], masks[root][i]))
        rig['groups'][g] = {'parent': None if g == root else root, 'pivots': pivots,
                            'pixels': [int(m.sum()) for m in masks[g]]}
    json.dump(rig, open(os.path.join(mroot, 'rig.json'), 'w'), indent=1)
    ok = True
    for i in range(8):
        comp = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
        for g in groups:
            comp.alpha_composite(Image.open(os.path.join(parts_dir, g, f'{DIRS[i]}.png')))
        a = np.array(comp).astype(int); b = np.array(Image.open(full[i]).convert('RGBA')).astype(int)
        diff = np.abs(a - b).sum(axis=2)
        n_diff = int(((diff > 0) & (b[:, :, 3] > 0)).sum())
        print(f'  {short} dir {DIRS[i]}: composite-vs-full differing opaque px = {n_diff}', flush=True)
        ok = ok and n_diff == 0
    print(f'{short} RIG {"DONE exact" if ok else "DONE WITH DIFFS — investigate"}', flush=True)
    return ok

def main():
    only = sys.argv[1:] or list(SPECS)
    d = Drive()
    results = {}
    try:
        for short in only:
            print(f'== {short} ==', flush=True)
            try:
                results[short] = build_one(d, short, SPECS[short])
            except Exception as e:
                print(f'  FAILED {short}: {e}', flush=True)
                results[short] = False
                break
    finally:
        d.close()
    print('RESULTS:', results, flush=True)

if __name__ == '__main__':
    main()
