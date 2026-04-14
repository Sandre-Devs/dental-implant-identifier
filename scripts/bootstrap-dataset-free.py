#!/usr/bin/env python3
"""
bootstrap-dataset-free.py
==========================
Alternativa SEM API Key: baixa datasets públicos de detecção de implantes
de fontes abertas (GitHub, Mendeley) e prepara para treino no DII.

Uso:
  python3 scripts/bootstrap-dataset-free.py [--source github|kaggle]

Fontes:
  github  — github.com/030didi/Dental-implant-detection (YOLO pronto)
"""

import os, sys, shutil, sqlite3, uuid, zipfile, urllib.request
from pathlib import Path
from datetime import datetime

BASE_DIR    = Path(__file__).resolve().parent.parent
DB_PATH     = BASE_DIR / 'data' / 'dii.db'
EXPORTS_DIR = BASE_DIR / 'exports'
EXPORTS_DIR.mkdir(exist_ok=True)

SOURCES = {
    'github': {
        'url':  'https://github.com/030didi/Dental-implant-detection/archive/refs/heads/main.zip',
        'name': 'Dental Implant Detection (GitHub — OBB)',
        'desc': 'Dataset público de implantes dentários com bounding boxes orientadas (YOLOv8 OBB)',
        'subpath': 'Dental-implant-detection-main',   # pasta dentro do zip
    }
}

def log(msg, level='INFO'):
    c = {'INFO':'\033[94m','OK':'\033[92m','WARN':'\033[93m','ERR':'\033[91m'}.get(level,'')
    print(f"{c}[{level}]\033[0m {msg}")

def get_admin_id(db):
    row = db.execute("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1").fetchone()
    if not row:
        sys.exit("❌ Nenhum admin no banco. Rode: node scripts/create-admin.js")
    return row[0]

def download_with_progress(url, dest):
    log(f"Baixando {url}")
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)

    def reporthook(count, block_size, total_size):
        if total_size > 0:
            pct = min(100, int(count * block_size * 100 / total_size))
            sys.stdout.write(f"\r  → {pct}% ({count*block_size//1024//1024}MB)")
            sys.stdout.flush()

    urllib.request.urlretrieve(url, dest, reporthook)
    print()
    log(f"Download concluído: {dest}", 'OK')
    return dest

def find_yolo_structure(base):
    """Procura pasta com estrutura train/val/test dentro do zip extraído."""
    for p in base.rglob('train'):
        if (p / 'images').exists() or (p.parent / 'val').exists():
            return p.parent
    # Tenta raiz
    if (base / 'train').exists(): return base
    return None

def convert_obb_to_bbox(label_file):
    """
    Converte labels OBB do YOLOv8 (8 coords) para bbox normal (cx cy w h).
    OBB: class x1 y1 x2 y2 x3 y3 x4 y4
    BBox: class cx cy w h
    """
    lines_out = []
    for line in label_file.read_text().strip().split('\n'):
        parts = line.strip().split()
        if not parts: continue
        cls = parts[0]
        coords = list(map(float, parts[1:]))
        if len(coords) == 8:
            # 4 pontos do polígono → bbox envolvente
            xs = coords[0::2]; ys = coords[1::2]
            x_min, x_max = min(xs), max(xs)
            y_min, y_max = min(ys), max(ys)
            cx = (x_min + x_max) / 2
            cy = (y_min + y_max) / 2
            w  = x_max - x_min
            h  = y_max - y_min
            lines_out.append(f"{cls} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")
        elif len(coords) == 4:
            lines_out.append(line.strip())  # já é bbox normal
    return '\n'.join(lines_out)

def process_split(src_split, dst_imgs, dst_labels, convert_obb=False):
    """Copia imagens e labels de um split."""
    dst_imgs.mkdir(parents=True, exist_ok=True)
    dst_labels.mkdir(parents=True, exist_ok=True)
    n = 0
    for split_name in ['images', 'Images', 'img']:
        img_dir = src_split / split_name
        if img_dir.exists(): break
    else:
        img_dir = src_split

    for img in img_dir.iterdir():
        if img.suffix.lower() in ('.jpg','.jpeg','.png','.bmp','.webp'):
            shutil.copy2(img, dst_imgs / img.name)
            n += 1
            # Label correspondente
            for label_dir_name in ['labels', 'Labels', 'label']:
                label_dir = src_split / label_dir_name
                if label_dir.exists():
                    label_file = label_dir / (img.stem + '.txt')
                    if label_file.exists():
                        dst_label = dst_labels / label_file.name
                        if convert_obb:
                            dst_label.write_text(convert_obb_to_bbox(label_file))
                        else:
                            shutil.copy2(label_file, dst_label)
                    break
    return n

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default='github', choices=list(SOURCES.keys()))
    parser.add_argument('--admin-id', default=None)
    args = parser.parse_args()

    src        = SOURCES[args.source]
    dataset_id = str(uuid.uuid4())
    zip_path   = EXPORTS_DIR / f"raw_{args.source}.zip"
    raw_dir    = EXPORTS_DIR / f"raw_{args.source}_extracted"
    out_dir    = EXPORTS_DIR / f"dataset_{dataset_id}"

    log(f"=== DII Bootstrap (sem API Key) ===")
    log(f"Fonte: {src['name']}")

    # ── Download ──────────────────────────────────────────────────
    if not zip_path.exists():
        download_with_progress(src['url'], zip_path)
    else:
        log(f"Zip já existe: {zip_path}", 'WARN')

    # ── Extração ──────────────────────────────────────────────────
    if not raw_dir.exists():
        log("Extraindo...")
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(raw_dir)
        log("Extração concluída", 'OK')

    # ── Localizar estrutura YOLO ──────────────────────────────────
    search_base = raw_dir / src.get('subpath', '')
    if not search_base.exists():
        search_base = raw_dir
    yolo_root = find_yolo_structure(search_base)
    if not yolo_root:
        log(f"Estrutura YOLO não encontrada em {search_base}", 'ERR')
        log(f"Conteúdo: {list(search_base.iterdir())[:10]}", 'WARN')
        sys.exit(1)
    log(f"Estrutura YOLO encontrada: {yolo_root}", 'OK')

    # ── Converter e reorganizar ───────────────────────────────────
    log("Convertendo para estrutura DII (imagens/{train,val,test}/ + labels/)...")
    counts  = {}
    is_obb  = any((yolo_root / s / 'labels').exists() and
                  any(len(l.split()) > 5 for l in open(next(
                    (yolo_root / s / 'labels').iterdir())).read().split('\n') if l.strip())
                  for s in ['train','valid','val'] if (yolo_root / s / 'labels').exists()
                  and any((yolo_root / s / 'labels').iterdir()))

    if is_obb:
        log("Detectado formato OBB — convertendo para bbox padrão", 'WARN')

    for split_src, split_dst in [('train','train'),('valid','val'),('val','val'),('test','test')]:
        src_split = yolo_root / split_src
        if not src_split.exists(): continue
        if split_dst in counts: continue  # evitar duplicar val/valid
        n = process_split(
            src_split,
            out_dir / 'images' / split_dst,
            out_dir / 'labels' / split_dst,
            convert_obb=is_obb
        )
        counts[split_dst] = n
        log(f"  {split_dst}: {n} imagens")

    # Se não tem test, cria vazio
    for s in ['train','val','test']:
        if s not in counts: counts[s] = 0
        (out_dir / 'images' / s).mkdir(parents=True, exist_ok=True)
        (out_dir / 'labels' / s).mkdir(parents=True, exist_ok=True)

    # ── data.yaml ─────────────────────────────────────────────────
    yaml_content = f"""# DII Bootstrap — {src['name']}
path: {out_dir}
train: images/train
val:   images/val
test:  images/test

nc: 1
names:
  0: implant
"""
    (out_dir / 'data.yaml').write_text(yaml_content)
    log("data.yaml gerado", 'OK')

    # ── Registrar no banco ────────────────────────────────────────
    total = sum(counts.values())
    if DB_PATH.exists():
        db       = sqlite3.connect(str(DB_PATH))
        admin_id = args.admin_id or get_admin_id(db)
        now      = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        db.execute("""
            INSERT INTO datasets
              (id,name,description,export_format,split_train,split_val,split_test,
               status,image_count,export_path,created_by,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            dataset_id, src['name'], src['desc'], 'yolo',
            round(counts['train']/max(total,1), 2),
            round(counts['val']  /max(total,1), 2),
            round(counts['test'] /max(total,1), 2),
            'ready', total, str(out_dir), admin_id, now, now
        ))
        db.commit()
        db.close()
        log(f"Registrado no banco — ID: {dataset_id}", 'OK')
    else:
        log("Banco não encontrado — dataset não registrado no DII", 'WARN')

    print()
    print("═" * 55)
    print(f"  ✅  Dataset pronto para treino!")
    print(f"  🖼   {counts['train']} treino  |  {counts['val']} val  |  {counts['test']} test")
    print(f"  📁  {out_dir}")
    print()
    print("  No painel DII → Modelos → Novo Treino")
    print(f"  Selecione: \"{src['name']}\"")
    print("═" * 55)

if __name__ == '__main__':
    main()
