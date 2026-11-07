"""Skeletal-rig research for SCRAP DUNGEON, separate from the main build.

Idea (the alternative to per-frame voxel models):
  PixelAOI renders a model identically regardless of box colours, so a
  variant of the scout where every non-group box is recoloured pure black
  renders with EXACTLY the same framing. Keying out near-black pixels
  leaves precisely the pixels that group contributes to the full render,
  and the groups' pixel sets are disjoint (each screen pixel belongs to
  exactly one front-most part). So compositing the group sprites with no
  transform reproduces the full render pixel-for-pixel, and rotating each
  group sprite about its joint pivot gives real skeletal animation
  (Spine-style 2D rig) from the existing voxel art.

  Joints are derived, not hand-placed: per direction, the joint is the
  part-mask pixel closest to the parent (torso) mask.

Outputs under research/skeletal/:
  frames/<model>/dir<i>.png  raw 96x96 frames per model variant
  parts/<group>/<DIR>.png    keyed part sprites
  rig.json                   parts, parents, pivots, rest pose
"""
import ast, json, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
from mcp_drive import Drive, box, DIRS

ROOT = '/home/hatch/workspace/scrap-dungeon/research/skeletal'
FRAMES = os.path.join(ROOT, 'frames')
PARTS = os.path.join(ROOT, 'parts')
os.makedirs(FRAMES, exist_ok=True)
os.makedirs(PARTS, exist_ok=True)

# ---- extract the scout box list from build_wmechs.py without executing it
SRC = '/home/hatch/workspace/model-sprites/work/build_wmechs.py'
tree = ast.parse(open(SRC).read())
colours = {}
models = None
for node in tree.body:
    if isinstance(node, ast.Assign) and len(node.targets) == 1:
        t = node.targets[0]
        if isinstance(t, ast.Name) and t.id == 'MODELS':
            models = node.value
        if isinstance(t, ast.Name) and isinstance(node.value, ast.Constant) \
                and isinstance(node.value.value, str) and node.value.value.startswith('#'):
            colours[t.id] = node.value.value
scout = None
for elt in models.elts:
    name = elt.elts[0].value
    if name == 'mech_light_scout':
        scout = elt
        break
assert scout is not None, 'scout not found'
shapes = []  # (frm, to, colour_hex, part)
for call in scout.elts[2].elts:
    a = call.args
    frm = tuple(ast.literal_eval(a[0]))
    to = tuple(ast.literal_eval(a[1]))
    col = colours[a[2].id] if isinstance(a[2], ast.Name) else a[2].value
    part = a[3].value
    shapes.append((frm, to, col, part))
print(f'scout boxes: {len(shapes)}')

def group_of(frm, part):
    if part in ('Leg L',):
        return 'legL'
    if part in ('Leg R',):
        return 'legR'
    if part == 'Feet':
        return 'legL' if frm[0] < 10 else 'legR'
    if part in ('Torso', 'Pack'):
        return 'torso'
    if part in ('Head', 'Antenna'):
        return 'head'
    if part == 'Arm L':
        return 'armL'
    if part in ('Arm R', 'Gun'):
        return 'armR'
    raise ValueError(part)

GROUPS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR']
PARENTS = {'torso': None, 'head': 'torso', 'armL': 'torso',
           'armR': 'torso', 'legL': 'torso', 'legR': 'torso'}
BLACK = '#000000'

def render_variant(d, name, group):
    """Render one variant; save raw frames resized to 96x96. Returns paths."""
    out = os.path.join(FRAMES, name)
    os.makedirs(out, exist_ok=True)
    variant = []
    for (frm, to, col, part) in shapes:
        c = col if (group is None or group_of(frm, part) == group) else BLACK
        variant.append(box(list(frm), list(to), c, part))
    d.call('new_model', {})
    for tool, args in variant:
        d.call(tool, args)
    if '#35e0ff' in {a['colour'] for (_, a) in variant}:
        d.call('model_colour', {'glow': {'#35e0ff': True}})
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
                fr.save(p)
                paths.append(p)
    d.call('save_document', {'path': f'{out}/{name}_doc.pxl'})
    d.call('close_document', {})
    print(f'  {name}: {len(paths)} frames', flush=True)
    return paths

def key_part(frame_path):
    """Mask of non-pure-black opaque pixels. Black boxes shade to exactly
    (0,0,0) (0 x anything = 0), while even deep-shadow part faces stay
    above zero, so exact-zero keying separates cleanly."""
    im = np.array(Image.open(frame_path).convert('RGBA')).astype(int)
    opaque = im[:, :, 3] > 0
    black = (im[:, :, 0] == 0) & (im[:, :, 1] == 0) & (im[:, :, 2] == 0)
    keep = opaque & ~black
    out = np.zeros_like(im)
    out[:, :, :3] = im[:, :, :3]
    out[:, :, 3] = np.where(keep, 255, 0)
    return Image.fromarray(out.astype('uint8'), 'RGBA'), keep

def closest_joint(part_mask, parent_mask):
    """Part-side pixel of the closest (part, parent) pixel pair."""
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

def main():
    d = None
    # NOTE: never save+close a doc left by a failed model here — closing a
    # failed doc poisons later new_model calls. Recovery is a fresh app
    # launch (done outside this script), then this runs clean.
    failed = []
    parts_complete = all(
        os.path.exists(os.path.join(PARTS, g, f'{DIRS[i]}.png'))
        for g in GROUPS for i in range(8))
    frames_complete = all(
        os.path.exists(os.path.join(FRAMES, n, f'dir{i}.png'))
        for n in ['scout_full'] + [f'scout_{g}' for g in GROUPS]
        for i in range(8))
    if parts_complete and frames_complete:
        print('parts + frames already on disk, skipping renders', flush=True)
        full = [os.path.join(FRAMES, 'scout_full', f'dir{i}.png') for i in range(8)]
        variants = {g: [os.path.join(FRAMES, f'scout_{g}', f'dir{i}.png') for i in range(8)]
                    for g in GROUPS}
    else:
        d = Drive()
        try:
            full = render_variant(d, 'scout_full', None)
            variants = {}
            for g in GROUPS:
                try:
                    variants[g] = render_variant(d, f'scout_{g}', g)
                except Exception as e:
                    failed.append((g, str(e)[:200]))
                    print(f'  FAILED {g}: {e}', flush=True)
                    break
        finally:
            d.close()
    if failed:
        print('FAILED:', failed)
        return
    # key out part sprites + derive pivots. Part colours are taken from the
    # FULL render at the variant-mask positions: the visor glow lights
    # neighbouring faces in the full render but not in glow-less variants,
    # so variant colours alone would leave the rest pose slightly dark
    # near the visor. Attribution by position is exact (identical framing).
    rig = {'cell': 96, 'dirs': DIRS, 'groups': {}}
    masks = {}
    full_ims = [np.array(Image.open(p).convert('RGBA')).astype(int) for p in full]
    for g in GROUPS:
        masks[g] = []
        for i, p in enumerate(variants[g]):
            _, keep = key_part(p)
            masks[g].append(keep)
    # Residual attribution: a few full-render pixels are covered by no
    # variant mask (renderer tie-break at coincident arm/torso faces:
    # 9 near-black px in W). Assign each to the nearest part mask so the
    # rest pose is exact by construction; the seam pixel moves with its
    # nearest part, which is the visually sensible owner.
    for i in range(8):
        coverage = np.zeros((96, 96), dtype=bool)
        for g in GROUPS:
            coverage |= masks[g][i]
        full_opaque = full_ims[i][:, :, 3] > 0
        residual = full_opaque & ~coverage
        if residual.any():
            ry, rx = np.where(residual)
            for (y, x) in zip(ry, rx):
                best_g, best_d2 = None, None
                for g in GROUPS:
                    my, mx = np.where(masks[g][i])
                    if len(mx) == 0:
                        continue
                    d2 = ((mx - x) ** 2 + (my - y) ** 2).min()
                    if best_d2 is None or d2 < best_d2:
                        best_g, best_d2 = g, d2
                masks[best_g][i][y, x] = True
            print(f'  dir {DIRS[i]}: residual px attributed: {int(residual.sum())}')
    for g in GROUPS:
        for i in range(8):
            spr = np.zeros_like(full_ims[i])
            spr[:, :, :3] = full_ims[i][:, :, :3]
            spr[:, :, 3] = np.where(masks[g][i], 255, 0)
            out = os.path.join(PARTS, g)
            os.makedirs(out, exist_ok=True)
            Image.fromarray(spr.astype('uint8'), 'RGBA').save(os.path.join(out, f'{DIRS[i]}.png'))
    for g in GROUPS:
        pivots = {}
        for i in range(8):
            if g == 'torso':
                ys, xs = np.where(masks[g][i])
                pivots[DIRS[i]] = [int(xs.mean()), int(ys.max())]  # bottom-centre
            elif masks[g][i].sum() == 0:
                # fully occluded in this direction (far leg in side views):
                # nothing to draw, so any pivot is fine — use torso centroid
                ys, xs = np.where(masks['torso'][i])
                pivots[DIRS[i]] = [int(xs.mean()), int(ys.mean())]
            else:
                pivots[DIRS[i]] = list(closest_joint(masks[g][i], masks['torso'][i]))
        rig['groups'][g] = {'parent': PARENTS[g], 'pivots': pivots,
                            'pixels': [int(m.sum()) for m in masks[g]]}
    json.dump(rig, open(os.path.join(ROOT, 'rig.json'), 'w'), indent=1)
    # composite-equality test: parts with no transform vs full render
    for i in range(8):
        comp = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
        for g in GROUPS:
            comp.alpha_composite(Image.open(os.path.join(PARTS, g, f'{DIRS[i]}.png')))
        full_im = Image.open(full[i]).convert('RGBA')
        a = np.array(comp).astype(int)
        b = np.array(full_im).astype(int)
        # compare only opaque content: full render's non-transparent pixels
        diff = np.abs(a - b).sum(axis=2)
        opaque_b = b[:, :, 3] > 0
        n_diff = int(((diff > 0) & opaque_b).sum())
        print(f'  dir {DIRS[i]}: composite-vs-full differing opaque px = {n_diff}')
    print('RIG DONE')

if __name__ == '__main__':
    main()
