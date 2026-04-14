
import sys, json, os
sys.stdout.reconfigure(line_buffering=True)

try:
    from ultralytics import YOLO
except ImportError:
    print("ERROR: ultralytics nao instalado. Execute: pip3 install ultralytics")
    sys.exit(1)

import torch
print(f"INIT: Python {sys.version.split()[0]} | PyTorch {torch.__version__} | CUDA: {torch.cuda.is_available()}")

model_path = 'yolov8s.pt'
data_yaml  = '/var/www/vhosts/sandre.dev/httpdocs/dii/exports/dataset_a522ff9d-726e-4601-af32-bc9545d7ddc8/data.yaml'
epochs     = 100
project    = '/var/www/vhosts/sandre.dev/httpdocs/dii/exports/run_b0898794-d5b5-49ca-8a2d-3eb44add4b43'
name       = 'train'
batch      = 8
imgsz      = 640
workers    = 2
device     = 'cuda:0' if torch.cuda.is_available() else 'cpu'

print(f"INIT: Arquitetura={model_path} | batch={batch} | imgsz={imgsz} | device={device}")
print(f"INIT: Carregando modelo base...")

try:
    model = YOLO(model_path)
except Exception as e:
    print(f"ERROR: Falha ao carregar modelo: {e}")
    sys.exit(1)

print(f"INIT: Iniciando treino — {epochs} epocas")
try:
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        project=project,
        name=name,
        exist_ok=True,
        verbose=True,
        plots=False,
        patience=20,
        batch=batch,
        imgsz=imgsz,
        device=device,
        workers=workers,
        cache=False,
        amp=False,
    )
except MemoryError:
    print("ERROR: Memoria insuficiente. Tente yolov8n ou yolov8s.")
    sys.exit(1)
except Exception as e:
    print(f"ERROR: Treino falhou: {e}")
    sys.exit(1)

try:
    box = results.results_dict
    print(f"METRICS:{json.dumps(box)}")
except Exception as e:
    print(f"WARN: Nao foi possivel ler metricas: {e}")

best_pt = os.path.join(project, name, 'weights', 'best.pt')
if os.path.exists(best_pt):
    print(f"BEST_MODEL:{best_pt}")
else:
    last_pt = os.path.join(project, name, 'weights', 'last.pt')
    if os.path.exists(last_pt):
        print(f"BEST_MODEL:{last_pt}")
        print("WARN: best.pt nao encontrado, usando last.pt")

print("DONE")
