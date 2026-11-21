"""Gera as camadas anatômicas do Espelho Raio-X (public/xray) a partir do BodyParts3D.

Como rodar (uma vez; o resultado já está versionado em public/xray):
  1. Baixe de https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html os arquivos
     partof_BP3D_4.0_obj_99.zip, isa_BP3D_4.0_obj_99.zip, partof_element_parts.txt e isa_element_parts.txt
     e descompacte os .zip numa pasta (ex.: bp3d/objs, bp3d/objs_isa).
  2. pip install trimesh fast_simplification numpy
  3. python scripts/build_xray_anatomy.py <pasta-bp3d> public/xray

Licença dos modelos: BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0.
"""
import glob
import json
import os
import sys

import numpy as np
import trimesh
import fast_simplification

RAW = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)

FILES = {}
for d in glob.glob(os.path.join(RAW, 'objs*', '*')):
    if os.path.isdir(d):
        for f in os.listdir(d):
            if f.endswith('.obj'):
                FILES[f[:-4]] = os.path.join(d, f)


def load(fj):
    m = trimesh.load(FILES[fj], process=False, force='mesh')
    return np.asarray(m.vertices, dtype=np.float64), np.asarray(m.faces, dtype=np.int64)


def merge(ids):
    vs, fs, off = [], [], 0
    for fj in ids:
        v, f = load(fj)
        vs.append(v)
        fs.append(f + off)
        off += len(v)
    return np.vstack(vs), np.vstack(fs)


def simplify(v, f, target):
    if len(f) <= target:
        return v, f
    red = 1.0 - target / len(f)
    v2, f2 = fast_simplification.simplify(v.astype(np.float32), f.astype(np.int32), target_reduction=red)
    return np.asarray(v2, np.float64), np.asarray(f2, np.int64)


# --------------------------------------------------------------------------------------
# 1. Alinhamento crânio -> rosto canônico
# --------------------------------------------------------------------------------------
nasal_v = np.vstack([load('FJ3272')[0], load('FJ3378')[0]])
top = nasal_v[nasal_v[:, 2] > nasal_v[:, 2].max() - 3]
nasion = top.mean(0)
mand_v, _ = load('FJ3289')
menton = mand_v[mand_v[:, 2] < mand_v[:, 2].min() + 2].mean(0)
eye_bp = np.vstack([load('FJ1317')[0], load('FJ1368')[0]]).mean(0)

# Pontos do rosto canônico (pele): cantos dos olhos (33/263, y=2.66), 168 (entre os olhos) e 152 (queixo)
FACE_168 = np.array([0.0, 3.27, 5.24])
FACE_152 = np.array([0.0, -9.40, 4.26])
EYE_Y = 2.55                      # centro do globo ocular ~ na altura dos cantos dos olhos
MENTON_Y = FACE_152[1] + 0.85     # tecido mole do queixo
S = (EYE_Y - MENTON_Y) / ((eye_bp[2] - menton[2]) * 0.1)
# Ajusta o alvo do násio para que o centro dos olhos caia em EYE_Y; profundidade: násio 5,5 mm atrás da pele
NASION_TARGET = np.array([0.0, EYE_Y + (nasion[2] - eye_bp[2]) * 0.1 * S, FACE_168[2] - 0.55])


def to_canon(v):
    """BodyParts3D (mm, x=esquerda do sujeito, y=posterior, z=cima) -> canônico (cm)."""
    d = (v - nasion) * 0.1 * S
    out = np.empty_like(d)
    out[:, 0] = d[:, 0]
    out[:, 1] = d[:, 2]
    out[:, 2] = -d[:, 1]
    return out + NASION_TARGET


# Eixo da articulação da mandíbula (côndilos)
mc = to_canon(mand_v)
upper = mc[mc[:, 1] > mc[:, 1].max() - 1.0]
post = upper[upper[:, 2] < np.median(upper[:, 2])]
condL = post[post[:, 0] > 0].mean(0)
condR = post[post[:, 0] < 0].mean(0)
JAW_PIVOT = (condL + condR) / 2

# --------------------------------------------------------------------------------------
# 2. Definição das peças da cabeça
# --------------------------------------------------------------------------------------
UP_TEETH = ['FJ1261', 'FJ1262', 'FJ1263', 'FJ1264', 'FJ1265', 'FJ1266', 'FJ1267',
            'FJ1275', 'FJ1276', 'FJ1277', 'FJ1278', 'FJ1279', 'FJ1280', 'FJ1281']
LOW_TEETH = ['FJ1254', 'FJ1255', 'FJ1256', 'FJ1257', 'FJ1258', 'FJ1259', 'FJ1260',
             'FJ1268', 'FJ1269', 'FJ1270', 'FJ1271', 'FJ1272', 'FJ1273', 'FJ1274']
EXTRAOCULAR = ['FJ1294', 'FJ1295', 'FJ1304', 'FJ1306', 'FJ1308', 'FJ1322', 'FJ1323',
               'FJ1345', 'FJ1346', 'FJ1355', 'FJ1357', 'FJ1359', 'FJ1373', 'FJ1374']

# (chave, camada, arquivos, rótulo pt-BR ou None, triângulos alvo, grupo)
HEAD = [
    ('frontal', 'skull', ['FJ3200'], 'Osso frontal', 7000, 'head'),
    ('parietalL', 'skull', ['FJ3274'], 'Osso parietal', 6000, 'head'),
    ('parietalR', 'skull', ['FJ3380'], 'Osso parietal', 6000, 'head'),
    ('occipital', 'skull', ['FJ3309'], 'Osso occipital', 6000, 'head'),
    ('temporalL', 'skull', ['FJ3281'], 'Osso temporal', 3500, 'head'),
    ('temporalR', 'skull', ['FJ3386'], 'Osso temporal', 3500, 'head'),
    ('sphenoid', 'skull', ['FJ3394'], 'Esfenoide', 4500, 'head'),
    ('ethmoid', 'skull', ['FJ3199'], None, 2500, 'head'),
    ('zygomaticL', 'skull', ['FJ3287'], 'Osso zigomático', 1200, 'head'),
    ('zygomaticR', 'skull', ['FJ3392'], 'Osso zigomático', 1200, 'head'),
    ('maxillaL', 'skull', ['FJ3269'], 'Maxila', 3000, 'head'),
    ('maxillaR', 'skull', ['FJ3375'], 'Maxila', 3000, 'head'),
    ('nasal', 'skull', ['FJ3272', 'FJ3378'], 'Osso nasal', 500, 'head'),
    ('small', 'skull', ['FJ3265', 'FJ3371', 'FJ3263', 'FJ3369', 'FJ3273', 'FJ3379', 'FJ3395'], None, 2500, 'head'),
    ('teethUp', 'skull', UP_TEETH, 'Dentes', 5000, 'head'),
    ('mandible', 'skull', ['FJ3289'], 'Mandíbula', 5000, 'jaw'),
    ('teethLow', 'skull', LOW_TEETH, None, 5000, 'jaw'),
    ('frontalLobeL', 'brain', ['FJ1833', 'FJ1787', 'FJ1744'], 'Lobo frontal', 4500, 'head'),
    ('frontalLobeR', 'brain', ['FJ1834', 'FJ1788', 'FJ1745'], None, 4500, 'head'),
    ('motorL', 'brain', ['FJ1800', 'FJ1797'], None, 2500, 'head'),
    ('motorR', 'brain', ['FJ1801', 'FJ1798'], 'Córtex motor', 2500, 'head'),
    ('parietalLobeL', 'brain', ['FJ1835', 'FJ1841', 'FJ1732'], 'Lobo parietal', 3500, 'head'),
    ('parietalLobeR', 'brain', ['FJ1836', 'FJ1842', 'FJ1733'], None, 3500, 'head'),
    ('temporalLobeL', 'brain', ['FJ1789', 'FJ1746', 'FJ1783', 'FJ1785'], None, 3000, 'head'),
    ('temporalLobeR', 'brain', ['FJ1790', 'FJ1747', 'FJ1784', 'FJ1786'], 'Lobo temporal', 3000, 'head'),
    ('occipitalLobeL', 'brain', ['FJ1791'], 'Lobo occipital', 1500, 'head'),
    ('occipitalLobeR', 'brain', ['FJ1792'], None, 1500, 'head'),
    ('deepBrain', 'brain', ['FJ1739', 'FJ1740', 'FJ1748', 'FJ1749', 'FJ1758', 'FJ1806', 'FJ1759', 'FJ1807',
                            'FJ1760', 'FJ1808', 'FJ1750', 'FJ1751', 'FJ1780', 'FJ1828', 'FJ1795', 'FJ1743'], None, 6000, 'head'),
    ('cerebellum', 'brain', ['FJ1781', 'FJ1830'], 'Cerebelo', 5000, 'head'),
    ('brainstem', 'brain', ['FJ1769', 'FJ1770', 'FJ1775', 'FJ1817', 'FJ1822', 'FJ1831', 'FJ1762', 'FJ1779', 'FJ1810', 'FJ1826'],
     'Tronco encefálico', 3000, 'head'),
    ('scleraL', 'eyes', ['FJ1317'], 'Globo ocular', 900, 'eyeL'),
    ('scleraR', 'eyes', ['FJ1368'], None, 900, 'eyeR'),
    ('corneaL', 'eyes', ['FJ1289'], None, 300, 'eyeL'),
    ('corneaR', 'eyes', ['FJ1340'], 'Córnea', 300, 'eyeR'),
    ('irisL', 'eyes', ['FJ1297'], None, 300, 'eyeL'),
    ('irisR', 'eyes', ['FJ1348'], 'Íris', 300, 'eyeR'),
    ('lensL', 'eyes', ['FJ1305'], 'Cristalino', 200, 'eyeL'),
    ('lensR', 'eyes', ['FJ1356'], None, 200, 'eyeR'),
    ('extraocular', 'muscles', EXTRAOCULAR, 'Músculos do olho', 2500, 'head'),
    ('scmL', 'muscles', ['FJ1573'], 'Esternocleidomastoideo', 1800, 'head'),
    ('scmR', 'muscles', ['FJ1595'], None, 1800, 'head'),
    ('digastric', 'muscles', ['FJ1555', 'FJ1556', 'FJ1560', 'FJ1578', 'FJ1579'], 'Digástrico', 800, 'head'),
    ('splenius', 'muscles', ['FJ1545', 'FJ1545M'], 'Esplênio da cabeça', 1800, 'head'),
    ('tongue', 'muscles', ['FJ2738', 'FJ2750', 'FJ2761'], 'Língua', 1500, 'jaw'),
]

# Centros dos olhos (para girar com o olhar)
EYE_CENTER = {
    'eyeL': to_canon(load('FJ1317')[0]).mean(0),
    'eyeR': to_canon(load('FJ1368')[0]).mean(0),
}
ORIGIN = {'head': np.zeros(3), 'jaw': JAW_PIVOT, **EYE_CENTER}

layers = {}
meta_parts = []
for key, layer, ids, label, target, group in HEAD:
    v, f = merge(ids)
    v = to_canon(v)
    anchor = v.mean(0)
    # âncora do rótulo: vértice mais externo perto do centro (fica na superfície)
    d = np.linalg.norm(v - anchor, axis=1)
    near = v[d < np.percentile(d, 25)]
    anchor = near[np.argmax(np.abs(near[:, 0]) + 0.5 * near[:, 2])] if len(near) else anchor
    v, f = simplify(v, f, target)
    v = v - ORIGIN[group]
    mesh = trimesh.Trimesh(vertices=v, faces=f, process=False)
    layers.setdefault(layer, trimesh.Scene()).add_geometry(mesh, node_name=key, geom_name=key)
    meta_parts.append({'key': key, 'layer': layer, 'group': group, 'label': label,
                       'anchor': np.round(anchor, 3).tolist(), 'tris': int(len(f))})
    print(f'{key:15s} {layer:8s} {len(f):6d} tris')

for name, scene in layers.items():
    scene.export(os.path.join(OUT, f'{name}.glb'))

# --------------------------------------------------------------------------------------
# 3. Mãos
# --------------------------------------------------------------------------------------
HAND_IDS = {
    'R': {
        'carpals': ['FJ3361', 'FJ3367', 'FJ3374', 'FJ3382', 'FJ3383', 'FJ3388', 'FJ3389', 'FJ3390'],
        'proxRow': ['FJ3374', 'FJ3383', 'FJ3390'],
        'mc': {1: 'FJ3350', 2: 'FJ3352', 3: 'FJ3354', 4: 'FJ3356', 5: 'FJ3358'},
        'prox': {1: 'FJ3327', 2: 'FJ3322', 3: 'FJ3325', 4: 'FJ3326', 5: 'FJ3323'},
        'mid': {2: 'FJ3303', 3: 'FJ3306', 4: 'FJ3292', 5: 'FJ3304'},
        'dist': {1: 'FJ3198', 2: 'FJ3193', 3: 'FJ3196', 4: 'FJ3197', 5: 'FJ3194'},
    },
}


def left_ids():
    names = {}
    for fn in ('isa_element_parts.txt', 'partof_element_parts.txt'):
        for line in open(os.path.join(RAW, fn), encoding='utf-8').read().splitlines()[1:]:
            c, n, e = line.split('\t')
            names.setdefault(n, set()).add(e)
    def one(n):
        es = [e for e in names.get(n, []) if e in FILES]
        return sorted(es)[0] if es else None
    digits = {1: 'thumb', 2: 'index finger', 3: 'middle finger', 4: 'ring finger', 5: 'little finger'}
    ordn = {1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth'}
    out = {
        'carpals': [one(f'left {c}') for c in ['capitate', 'hamate', 'lunate', 'pisiform', 'scaphoid', 'trapezium', 'trapezoid', 'triquetral']],
        'proxRow': [one('left lunate'), one('left scaphoid'), one('left triquetral')],
        'mc': {i: one(f'left {ordn[i]} metacarpal bone') for i in range(1, 6)},
        'prox': {i: one(f'proximal phalanx of left {digits[i]}') for i in range(1, 6)},
        'mid': {i: one(f'middle phalanx of left {digits[i]}') for i in range(2, 6)},
        'dist': {i: one(f'distal phalanx of left {digits[i]}') for i in range(1, 6)},
    }
    return out


HAND_IDS['L'] = left_ids()

# Pares de pontos do MediaPipe Hands para cada osso
MC_LM = {1: (1, 2)}
PROX_LM = {1: (2, 3), 2: (5, 6), 3: (9, 10), 4: (13, 14), 5: (17, 18)}
MID_LM = {2: (6, 7), 3: (10, 11), 4: (14, 15), 5: (18, 19)}
DIST_LM = {1: (3, 4), 2: (7, 8), 3: (11, 12), 4: (15, 16), 5: (19, 20)}


def bone_axis(v, toward):
    c = v.mean(0)
    u, s, vt = np.linalg.svd(v - c, full_matrices=False)
    ax = vt[0]
    if np.dot(ax, toward - c) < 0:
        ax = -ax
    t = (v - c) @ ax
    lo, hi = t.min(), t.max()
    p0 = c + ax * lo
    p1 = c + ax * hi
    return p0, p1


def frame(y, n):
    y = y / np.linalg.norm(y)
    z = n - np.dot(n, y) * y
    z = z / np.linalg.norm(z)
    x = np.cross(y, z)
    return np.stack([x, y, z], 1)  # colunas


hand_meta = {}
for side, ids in HAND_IDS.items():
    wrist = merge(ids['proxRow'])[0].mean(0)
    mcp = {}
    mc_mesh = {}
    for i, fj in ids['mc'].items():
        v, f = load(fj)
        p0, p1 = bone_axis(v, v.mean(0) + (v.mean(0) - wrist))
        mcp[i] = p1
        mc_mesh[i] = (v, f, p0, p1)
    # Normal da palma, com a mesma fórmula usada em tempo real: cross(MCP2 - punho, MCP5 - punho)
    normal = np.cross(mcp[2] - wrist, mcp[5] - wrist)
    normal /= np.linalg.norm(normal)
    palm_len = np.linalg.norm(mcp[3] - wrist)
    R = frame(mcp[3] - wrist, normal)

    scene = trimesh.Scene()
    bones = []
    # Palma rígida: metacarpos 2-5 + carpos, no referencial (origem punho, Y -> MCP3, Z normal), escala = 1/palm_len
    pv, pf = [], []
    off = 0
    for i in (2, 3, 4, 5):
        v, f, _, _ = mc_mesh[i]
        pv.append(v); pf.append(f + off); off += len(v)
    cv, cf = merge([c for c in ids['carpals'] if c])
    pv.append(cv); pf.append(cf + off)
    v, f = np.vstack(pv), np.vstack(pf)
    v, f = simplify(v, f, 3500)
    local = ((v - wrist) @ R) / palm_len
    scene.add_geometry(trimesh.Trimesh(local, f, process=False), node_name='palm', geom_name='palm')
    bones.append({'key': 'palm', 'type': 'palm'})

    def add_bone(key, fj, lm):
        v, f = load(fj)
        a, b = lm
        p0, p1 = bone_axis(v, v.mean(0) + (v.mean(0) - wrist))
        L = np.linalg.norm(p1 - p0)
        Rb = frame(p1 - p0, normal)
        v, f = simplify(v, f, 420)
        local = ((v - p0) @ Rb) / L
        scene.add_geometry(trimesh.Trimesh(local, f, process=False), node_name=key, geom_name=key)
        bones.append({'key': key, 'type': 'seg', 'a': a, 'b': b, 'width': round(float(L / palm_len), 4)})

    add_bone('mc1', ids['mc'][1], MC_LM[1])
    for i, (a, b) in PROX_LM.items():
        add_bone(f'prox{i}', ids['prox'][i], (a, b))
    for i, (a, b) in MID_LM.items():
        add_bone(f'mid{i}', ids['mid'][i], (a, b))
    for i, (a, b) in DIST_LM.items():
        add_bone(f'dist{i}', ids['dist'][i], (a, b))
    scene.export(os.path.join(OUT, f'hand{side}.glb'))
    hand_meta[side] = bones
    print('hand', side, 'ok', len(bones), 'bones')

meta = {
    'source': 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0 (malhas simplificadas e realinhadas)',
    'units': 'cm, espaço do canonical face model do MediaPipe',
    'jawPivot': np.round(JAW_PIVOT, 3).tolist(),
    'eyeCenters': {k: np.round(v, 3).tolist() for k, v in EYE_CENTER.items()},
    'parts': meta_parts,
    'hands': hand_meta,
}
with open(os.path.join(OUT, 'anatomy.json'), 'w', encoding='utf-8') as fh:
    json.dump(meta, fh, ensure_ascii=False, indent=1)
print('scale', S, 'jawPivot', JAW_PIVOT, 'eyes', EYE_CENTER)
