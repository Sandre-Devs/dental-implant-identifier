
import sys, json, os
sys.stdout.reconfigure(line_buffering=True)

try:
    from ultralytics import YOLO
except ImportError:
    print("ERROR: ultralytics não instalado. Execute: pip3 install ultralytics")
    sys.exit(1)

model_path = 'yolov8m.pt'
data_yaml  = '/var/www/vhosts/sandre.dev/httpdocs/dii/exports/dataset_a0c0e553-4045-4d2c-80f0-4377935b194a/data.yaml'
epochs     = 100
project    = '/var/www/vhosts/sandre.dev/httpdocs/dii/exports/run_b8e00e20-7f1f-4794-b62e-fc477d7e0ae3'
name       = 'train'

print(f"INIT: Carregando modelo base {model_path}")
model = YOLO(model_path)

print(f"INIT: Iniciando treino — {epochs} épocas")
results = model.train(
    data=data_yaml,
    epochs=epochs,
    project=project,
    name=name,
    exist_ok=True,
    verbose=True,
    plots=True,
    patience=20,
    batch=8,
    imgsz=640,
    device='cpu',
)

# Métricas finais
metrics_path = os.path.join(project, name, 'results.json')
try:
    box = results.results_dict
    print(f"METRICS:{json.dumps(box)}")
except:
    pass

best_pt = os.path.join(project, name, 'weights', 'best.pt')
print(f"BEST_MODEL:{best_pt}")
print("DONE")
