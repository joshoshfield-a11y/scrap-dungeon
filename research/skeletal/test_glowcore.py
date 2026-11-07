"""Test: does an interior CY voxel (inside the solid torso, never visible)
restore glow lighting in a glow-less variant? Renders legL + interior CY
with glow, checks the 9 W pixels lost to exact black."""
import sys, os, io, base64
import numpy as np
from PIL import Image
sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
sys.path.insert(0, '/home/hatch/workspace/scrap-dungeon/research/skeletal')
from mcp_drive import Drive, box
import importlib.util
spec = importlib.util.spec_from_file_location('br', '/home/hatch/workspace/scrap-dungeon/research/skeletal/build_rig.py')
# don't execute main; replicate shapes extraction by importing module pieces is messy,
# so re-parse quickly:
import ast
SRC = '/home/hatch/workspace/model-sprites/work/build_wmechs.py'
tree = ast.parse(open(SRC).read())
colours, models = {}, None
for node in tree.body:
    if isinstance(node, ast.Assign) and len(node.targets) == 1:
        t = node.targets[0]
        if isinstance(t, ast.Name) and t.id == 'MODELS':
            models = node.value
        if isinstance(t, ast.Name) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str) and node.value.value.startswith('#'):
            colours[t.id] = node.value.value
scout = next(e for e in models.elts if e.elts[0].value == 'mech_light_scout')
shapes = []
for call in scout.elts[2].elts:
    a = call.args
    shapes.append((tuple(ast.literal_eval(a[0])), tuple(ast.literal_eval(a[1])),
                   colours[a[2].id] if isinstance(a[2], ast.Name) else a[2].value,
                   a[3].value))
def group_of(frm, part):
    if part == 'Leg L': return 'legL'
    if part == 'Leg R': return 'legR'
    if part == 'Feet': return 'legL' if frm[0] < 10 else 'legR'
    if part in ('Torso', 'Pack'): return 'torso'
    if part in ('Head', 'Antenna'): return 'head'
    if part == 'Arm L': return 'armL'
    return 'armR'
d = Drive()
try:
    variant = []
    for (frm, to, col, part) in shapes:
        c = col if group_of(frm, part) == 'legL' else '#000000'
        variant.append(box(list(frm), list(to), c, part))
    variant.append(box([9, 7, 9], [9, 7, 9], '#35e0ff', 'GlowCore'))
    d.call('new_model', {})
    for tool, args in variant:
        d.call(tool, args)
    d.call('model_colour', {'glow': {'#35e0ff': True}})
    d.call('render_model', {'into': 'new_sprite'})
    st = d.json_of(d.call('get_state', {}))
    d.call('select_frame', {'index': 2})
    res = d.call('get_canvas_image', {})
    for c in res.get('content', []):
        if c.get('type') == 'image':
            fr = Image.open(io.BytesIO(base64.b64decode(c['data']))).convert('RGBA')
            fr = fr.resize((96, 96), Image.NEAREST)
            im = np.array(fr)
            print('W pixels (42-44,48-50):')
            for y in (48, 49, 50):
                print('  y', y, [tuple(im[y, x]) for x in (42, 43, 44)])
            # check the interior voxel didn't leak anywhere: count CY pixels
            cy = (im[:, :, 0] == 0x35) & (im[:, :, 1] == 0xe0) & (im[:, :, 2] == 0xff)
            print('CY pixels in W frame:', int(cy.sum()))
    d.call('save_document', {'path': '/tmp/glowcore-test.pxl'})
    d.call('close_document', {})
    print('GLOWCORE TEST DONE')
except Exception as e:
    print('GLOWCORE TEST FAILED:', str(e)[:300])
finally:
    d.close()
