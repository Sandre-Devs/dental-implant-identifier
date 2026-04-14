#!/usr/bin/env python3
"""
bootstrap-dataset.py
====================
Baixa o dataset público de implantes dentários do Roboflow Universe
e o registra no banco de dados do DII, pronto para treino.

Uso:
  python3 scripts/bootstrap-dataset.py --api-key SUA_API_KEY [--admin-id UUID]

API Key gratuita: https://app.roboflow.com → Settings → API Keys
Dataset usado: https://universe.roboflow.com/yosafat_chandra05-yahoo-com/dental-implants-2.0
"""

import argparse, json, os, shutil, sys, sqlite3, uuid
from pathlib import Path
from datetime import datetime

# ── Paths ──────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).resolve().parent.parent
DB_PATH     = BASE_DIR / 'data' / 'dii.db'
EXPORTS_DIR = BASE_DIR / 'exports'
UPLOADS_DIR = BASE_DIR / 'uploads'
EXPORTS_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

# ── Datasets disponíveis ────────────────────────────────────────
DATASETS = {
    'dental-implants': {
        'workspace': 'yosafat_chandra05-yahoo-com',
        'project':   'dental-implants-2.0',
        'version':   1,
        'description': 'Dental Implants 2.0 — Roboflow Universe (panorâmicas com bbox de implantes)',
    },
    'dental-implants-v2': {
        'workspace': 'dental-implants-detection',
        'project':   'dental-implant-detection',
        'version':   1,
        'description': 'Dental Implant Detection — radiografias periapicais',
    }
}

def log(msg, level='INFO'):
    colors = {'INFO': '\033[94m', 'OK': '\033[92m', 'WARN': '\033[93m', 'ERR': '\033[91m'}
    reset  = '\033[0m'
    c = colors.get(level, '')
    print(f"{c}[{level}]{reset} {msg}")

def get_admin_id(db):
    row = db.execute("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1").fetchone()
    if not row:
        sys.exit("❌ Nenhum admin encontrado no banco. Crie um admin primeiro:\n   node scripts/create-admin.js")
    return row[0]

def download_roboflow(api_key, workspace, project, version, out_dir):
    """Baixa dataset do Roboflow no formato YOLOv8."""
    try:
        from roboflow import Roboflow
    except ImportError:
        log("Instalando roboflow...", 'WARN')
        os.system(f"{sys.executable} -m pip install roboflow -q")
        from roboflow import Roboflow

    log(f"Conectando ao Roboflow ({workspace}/{project} v{version})...")
    rf      = Roboflow(api_key=api_key)
    project = rf.workspace(workspace).project(project)
    dataset = project.version(version).download("yolov8", location=str(out_dir), overwrite=True)
    log(f"Download concluído em {out_dir}", 'OK')
    return dataset

def count_images(dataset_dir):
    total = 0
    for split in ['train', 'valid', 'test']:
        img_dir = dataset_dir / split / 'images'
        if img_dir.exists():
            total += len(list(img_dir.glob('*.jpg')) + list(img_dir.glob('*.png')) + list(img_dir.glob('*.jpeg')))
    return total

def normalize_structure(raw_dir, out_dir):
    """
    Roboflow gera: {split}/images/ e {split}/labels/
    Worker espera: images/{split}/ e labels/{split}/
    Esta função reorganiza e retorna contagens.
    """
    counts = {}
    for split_src, split_dst in [('train','train'), ('valid','val'), ('test','test')]:
        src_imgs   = raw_dir / split_src / 'images'
        src_labels = raw_dir / split_src / 'labels'
        dst_imgs   = out_dir / 'images' / split_dst
        dst_labels = out_dir / 'labels' / split_dst
        dst_imgs.mkdir(parents=True, exist_ok=True)
        dst_labels.mkdir(parents=True, exist_ok=True)

        n = 0
        if src_imgs.exists():
            for f in src_imgs.iterdir():
                shutil.copy2(f, dst_imgs / f.name)
                n += 1
        if src_labels.exists():
            for f in src_labels.iterdir():
                shutil.copy2(f, dst_labels / f.name)
        counts[split_dst] = n
        log(f"  {split_dst}: {n} imagens")
    return counts

def read_classes(raw_dir):
    """Lê classes do data.yaml do Roboflow."""
    yaml_path = raw_dir / 'data.yaml'
    if not yaml_path.exists():
        return ['implant']
    try:
        import yaml
        with open(yaml_path) as f:
            data = yaml.safe_load(f)
        names = data.get('names', ['implant'])
        return names if isinstance(names, list) else list(names.values())
    except:
        # Parse manual simples
        for line in yaml_path.read_text().split('\n'):
            if line.strip().startswith('names:'):
                try:
                    import re
                    matches = re.findall(r"'([^']+)'|\"([^\"]+)\"", line)
                    classes = [m[0] or m[1] for m in matches]
                    if classes: return classes
                except: pass
        return ['implant']

def write_yaml(out_dir, classes):
    nc    = len(classes)
    names = '\n'.join(f'  {i}: {c}' for i, c in enumerate(classes))
    yaml  = f"""# DII Bootstrap Dataset
path: {out_dir}
train: images/train
val:   images/val
test:  images/test

nc: {nc}
names:
{names}
"""
    (out_dir / 'data.yaml').write_text(yaml)
    log(f"data.yaml gerado: {nc} classe(s) — {', '.join(classes)}", 'OK')

def register_in_db(db, admin_id, dataset_id, name, description, out_dir, counts):
    """Registra o dataset no banco do DII como status='ready'."""
    total = sum(counts.values())
    now   = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')

    # Verifica se já existe
    existing = db.execute("SELECT id FROM datasets WHERE id=?", (dataset_id,)).fetchone()
    if existing:
        db.execute("""
            UPDATE datasets SET status='ready', export_path=?, image_count=?, updated_at=?
            WHERE id=?
        """, (str(out_dir), total, now, dataset_id))
        log(f"Dataset atualizado no banco (id={dataset_id})", 'OK')
    else:
        db.execute("""
            INSERT INTO datasets
              (id, name, description, export_format, split_train, split_val, split_test,
               status, image_count, export_path, created_by, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            dataset_id, name, description, 'yolo',
            counts.get('train',0) / max(total,1),
            counts.get('val',0)   / max(total,1),
            counts.get('test',0)  / max(total,1),
            'ready', total, str(out_dir),
            admin_id, now, now
        ))
        log(f"Dataset registrado no banco: {name} ({total} imagens)", 'OK')
    db.commit()

def main():
    parser = argparse.ArgumentParser(description='Bootstrap dataset de implantes dentários')
    parser.add_argument('--api-key',  required=True,  help='Roboflow API Key (app.roboflow.com)')
    parser.add_argument('--dataset',  default='dental-implants', choices=list(DATASETS.keys()),
                        help='Dataset a baixar (default: dental-implants)')
    parser.add_argument('--admin-id', default=None,   help='UUID do usuário admin (auto-detectado se omitido)')
    parser.add_argument('--skip-download', action='store_true', help='Pular download (usar pasta já existente)')
    args = parser.parse_args()

    cfg        = DATASETS[args.dataset]
    dataset_id = str(uuid.uuid4())
    name       = f"Bootstrap — {cfg['project']} (Roboflow)"
    raw_dir    = EXPORTS_DIR / f"roboflow_raw_{args.dataset}"
    out_dir    = EXPORTS_DIR / f"dataset_{dataset_id}"

    log(f"=== DII Bootstrap Dataset ===")
    log(f"Dataset: {cfg['project']}")
    log(f"Destino: {out_dir}")

    # ── 1. Download ──────────────────────────────────────────────
    if not args.skip_download:
        download_roboflow(args.api_key, cfg['workspace'], cfg['project'], cfg['version'], raw_dir)
    else:
        log(f"Pulando download, usando {raw_dir}", 'WARN')
        if not raw_dir.exists():
            sys.exit(f"❌ Pasta {raw_dir} não existe. Remova --skip-download.")

    # ── 2. Reorganizar estrutura ─────────────────────────────────
    log("Reorganizando estrutura para formato DII...")
    counts = normalize_structure(raw_dir, out_dir)

    # ── 3. Ler classes e gerar data.yaml ─────────────────────────
    classes = read_classes(raw_dir)
    write_yaml(out_dir, classes)

    # ── 4. Registrar no banco ────────────────────────────────────
    if not DB_PATH.exists():
        log(f"Banco não encontrado em {DB_PATH}. Pulando registro.", 'WARN')
        log(f"Execute manualmente: node scripts/register-dataset.js {out_dir}", 'WARN')
    else:
        db       = sqlite3.connect(str(DB_PATH))
        admin_id = args.admin_id or get_admin_id(db)
        register_in_db(db, admin_id, dataset_id, name, cfg['description'], out_dir, counts)
        db.close()
        log(f"Dataset ID para treino: {dataset_id}", 'OK')

    # ── 5. Resumo ─────────────────────────────────────────────────
    total = sum(counts.values())
    print()
    print("═" * 50)
    print(f"  ✅ Dataset pronto!")
    print(f"  📁 {out_dir}")
    print(f"  🖼  {counts.get('train',0)} treino  |  {counts.get('val',0)} val  |  {counts.get('test',0)} test")
    print(f"  📊 Total: {total} imagens")
    print()
    print("  Próximo passo — iniciar treino pelo painel DII:")
    print(f"  Modelos → Novo Treino → selecione '{name}'")
    print("═" * 50)

if __name__ == '__main__':
    main()
