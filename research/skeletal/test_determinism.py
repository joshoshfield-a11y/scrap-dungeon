"""Determinism check: render the identical full scout model again and diff
against the existing full frames. If the renderer itself jitters by ~9px,
the W residual is renderer noise, not a rig error."""
import sys, os, io, base64, ast
import numpy as np
from PIL import Image
sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
from mcp_drive import Drive, box
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
    shapes.append(box(list(ast.literal_eval(a[0])), list(ast.literal_eval(a[1])),
                      colours[a[2].id] if isinstance(a[2], ast.Name) else a[2].value,
                      a[3].value))
d = Drive()
try:
    d.call('new_model', {})
    for tool, args in shapes:
        d.call(tool, args)
    d.call('model_colour', {'glow': {'#35e0ff': True}})
    d.call('render_model', {'into': 'new_sprite'})
    st = d.json_of(d.call('get_state', {}))
    for i in range(st['frames']):
        d.call('select_frame', {'index': i})
        res = d.call('get_canvas_image', {})
        for c in res.get('content', []):
            if c.get('type') == 'image':
                fr = Image.open(io.BytesIO(base64.b64decode(c['data']))).convert('RGBA')
                fr = fr.resize((96, 96), Image.NEAREST)
                old = np.array(Image.open(f'/home/hatch/workspace/scrap-dungeon/research/skeletal/frames/scout_full/dir{i}.png').convert('RGBA')).astype(int)
                new = np.array(fr).astype(int)
                diff = (np.abs(old - new).sum(axis=2) > 0) & ((old[:, :, 3] > 0) | (new[:, :, 3] > 0))
                print(f'  dir{i}: full-vs-full diff px = {int(diff.sum())}')
    d.call('save_document', {'path': '/tmp/determinism-test.pxl'})
    d.call('close_document', {})
    print('DETERMINISM TEST DONE')
except Exception as e:
    print('FAILED:', str(e)[:300])
finally:
    d.close()
