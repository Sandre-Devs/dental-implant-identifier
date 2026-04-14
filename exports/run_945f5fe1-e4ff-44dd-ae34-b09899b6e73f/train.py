
import sys, json, os
sys.stdout.reconfigure(line_buffering=True)

try:
    from ultralytics import YOLO
except ImportError:
    print("ERROR: ultralytics não instalado. Execute: pip3 install ultralytics")
    sys.exit(1)

model_path = 'yolov8m.pt'
data_yaml  = '/var/www/vhosts/sandre.dev/httpdocs/dii/exports/dataset_adc5475d-7cc5-4c10-ab44-2a5ad73cba83/data.yaml'
epochs     = 100
project    = '/var/www/vhosts/sandre.dev/httpdocs/dii/exports/run_945f5fe1-e4ff-44dd-ae34-b09899b6e73f'
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
