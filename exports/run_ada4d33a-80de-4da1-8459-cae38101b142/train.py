
import sys, json, os
sys.stdout.reconfigure(line_buffering=True)

try:
    from ultralytics import YOLO
except ImportError:
    print("ERROR: ultralytics não instalado. Execute: pip3 install ultralytics")
    sys.exit(1)

model_path = 'yolov8s.pt'
data_yaml  = '/var/www/vhosts/sandre.dev/httpdocs/dii/exports/dataset_a522ff9d-726e-4601-af32-bc9545d7ddc8/data.yaml'
epochs     = 100
project    = '/var/www/vhosts/sandre.dev/httpdocs/dii/exports/run_ada4d33a-80de-4da1-8459-cae38101b142'
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
