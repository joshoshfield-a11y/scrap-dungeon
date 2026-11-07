"""Rig the other SCRAP DUNGEON combatants, same proven method as the scout.

Same method, generalized (see build_rig.py / README.md for the proof):
  render full + one variant per part-group with every other box black,
  key exact black, take part colours from the full render at mask
  positions, attribute residual pixels to the nearest mask, derive
  pivots from masks (root = bottom-centre, rotor = centroid, others =
  closest pixel to the root mask). Rest-pose composite must be 0
  differing opaque pixels in all 8 directions, per model.

Models (flat FK, all children of the root — fists/claws/pauldrons are
merged into their arm/torso groups, exactly as the scout merged Gun
into armR and Pack into torso, so the pipeline stays identical):
  raider: mech_red_raider (wmechs) — Blade split by x, like Feet
  brute:  mech_heavy_brute (wmechs) — Fist/Claw into arms, Spike into torso
  drone:  mech_small_drone (wmechs) — root is body; Arm split by x;
          Rotor pivot is its centroid (it spins, it does not hinge)
  boss:   mech_boss (scrap1) — Pauldron/Spike into torso, Fist into arms,
          Head/Visor/Horn into head, Chest/Core/Belt into torso

Outputs under research/skeletal/rigs/<short>/:
  frames/<variant>/dir<i>.png, parts/<group>/<DIR>.png, rig.json
Resumable per model: if its parts + frames are complete, renders skip.
"""
import ast, json, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
from mcp_drive import Drive, box, DIRS

ROOT = '/home/hatch/workspace/scrap-dungeon/research/skeletal'
OUT = os.path.join(ROOT, 'rigs')
os.makedirs(OUT, exist_ok=True)
BLACK = '#000000'

def parse_file(src, list_name):
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

def extract_wmech(name):
    colours, models = parse_file('/home/hatch/workspace/model-sprites/work/build_wmechs.py', 'MODELS')
    for elt in models.elts:
        if elt.elts[0].value == name:
            glows = [colours[g.id] for g in elt.elts[1].elts]
            shapes = []
            for call in elt.elts[2].elts:
                a = call.args
                frm = tuple(ast.literal_eval(a[0])); to = tuple(ast.literal_eval(a[1]))
                col = colours[a[2].id] if isinstance(a[2], ast.Name) else a[2].value
                shapes.append((frm, to, col, a[3].value))
            return shapes, glows
    raise ValueError(name)

def extract_boss():
    colours, mechs = parse_file('/home/hatch/workspace/scrap-dungeon/build_scrap1.py', 'MECHS')
    for elt in mechs.elts:
        if elt.elts[0].value == 'mech_boss':
            glows = [colours[g.id] for g in elt.elts[1].elts]
            shapes = []
            for call in elt.elts[2].elts:
                a = call.args  # box(from, to, colour, part)
                frm = tuple(ast.literal_eval(a[0])); to = tuple(ast.literal_eval(a[1]))
                col = colours[a[2].id] if isinstance(a[2], ast.Name) else a[2].value
                shapes.append((frm, to, col, a[3].value))
            return shapes, glows
    raise ValueError('mech_boss')

def split(frm):
    return 'L' if frm[0] < 10 else 'R'

def group_raider(frm, part):
    if part == 'Feet': return 'legL' if split(frm) == 'L' else 'legR'
    if part == 'Leg L': return 'legL'
    if part == 'Leg R': return 'legR'
    if part == 'Torso': return 'torso'
    if part == 'Head': return 'head'
    if part == 'Arm L': return 'armL'
    if part == 'Arm R': return 'armR'
    if part == 'Blade': return 'armL' if split(frm) == 'L' else 'armR'
    raise ValueError(part)

def group_brute(frm, part):
    if part == 'Feet': return 'legL' if split(frm) == 'L' else 'legR'
    if part == 'Leg L': return 'legL'
    if part == 'Leg R': return 'legR'
    if part in ('Torso', 'Spike'): return 'torso'
    if part == 'Head': return 'head'
    if part in ('Arm L', 'Fist L'): return 'armL'
    if part in ('Arm R', 'Fist R'): return 'armR'
    if part == 'Claw': return 'armL' if split(frm) == 'L' else 'armR'
    raise ValueError(part)

def group_drone(frm, part):
    if part == 'Body': return 'body'
    if part == 'Rotor': return 'rotor'
    if part == 'Arm': return 'armL' if split(frm) == 'L' else 'armR'
    if part == 'Skid': return 'skid'
    raise ValueError(part)

def group_boss(frm, part):
    if part == 'Feet': return 'legL' if split(frm) == 'L' else 'legR'
    if part == 'Leg L': return 'legL'
    if part == 'Leg R': return 'legR'
    if part in ('Torso', 'Chest', 'Core', 'Belt', 'Pauldron L', 'Pauldron R', 'Spike'): return 'torso'
    if part in ('Head', 'Visor', 'Horn'): return 'head'
    if part in ('Arm L', 'Fist L'): return 'armL'
    if part in ('Arm R', 'Fist R'): return 'armR'
    raise ValueError(part)

CONFIGS = {
    'raider': {'shapes': None, 'glows': None, 'group_of': group_raider,
               'groups': ['torso', 'head', 'armL', 'armR', 'legL', 'legR'], 'root': 'torso'},
    'brute':  {'shapes': None, 'glows': None, 'group_of': group_brute,
               'groups': ['torso', 'head', 'armL', 'armR', 'legL', 'legR'], 'root': 'torso'},
    'drone':  {'shapes': None, 'glows': None, 'group_of': group_drone,
               'groups': ['body', 'armL', 'armR', 'rotor', 'skid'], 'root': 'body'},
    'boss':   {'shapes': None, 'glows': None, 'group_of': group_boss,
               'groups': ['torso', 'head', 'armL', 'armR', 'legL', 'legR'], 'root': 'torso'},
}
CONFIGS['raider']['shapes'], CONFIGS['raider']['glows'] = extract_wmech('mech_red_raider')
CONFIGS['brute']['shapes'], CONFIGS['brute']['glows'] = extract_wmech('mech_heavy_brute')
CONFIGS['drone']['shapes'], CONFIGS['drone']['glows'] = extract_wmech('mech_small_drone')
CONFIGS['boss']['shapes'], CONFIGS['boss']['glows'] = extract_boss()
for s, c in CONFIGS.items():
    print(f'{s}: {len(c["shapes"])} boxes, glows {c["glows"]}, groups {c["groups"]}', flush=True)

def render_variant(d, outdir, name, shapes, group_of, group, glows):
    out = os.path.join(outdir, name)
    os.makedirs(out, exist_ok=True)
    variant = []
    for (frm, to, col, part) in shapes:
        c = col if (group is None or group_of(frm, part) == group) else BLACK
        variant.append(box(list(frm), list(to), c, part))
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
    keep = opaque & ~black
    return keep

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
            elif g == 'rotor':
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
    only = sys.argv[1:] or list(CONFIGS)
    d = Drive()
    results = {}
    try:
        for short in only:
            print(f'== {short} ==', flush=True)
            try:
                results[short] = build_one(d, short, CONFIGS[short])
            except Exception as e:
                print(f'  FAILED {short}: {e}', flush=True)
                results[short] = False
                break
    finally:
        d.close()
    print('RESULTS:', results, flush=True)

if __name__ == '__main__':
    main()
