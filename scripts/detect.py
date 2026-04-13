#!/usr/bin/env python3
"""
detect.py  <image_path> <model_path> [conf_threshold]

Roda YOLOv8 na imagem e imprime JSON com detecções normalizadas (0-1).
Exemplo de saída:
[
  {"bbox_x": 0.12, "bbox_y": 0.34, "bbox_w": 0.08, "bbox_h": 0.15,
   "confidence": 0.87, "class_id": 0, "class_name": "implant"}
]
"""
import sys, json

def main():
    if len(sys.argv) < 3:
        print("[]"); return

    image_path = sys.argv[1]
    model_path = sys.argv[2]
    conf = float(sys.argv[3]) if len(sys.argv) > 3 else 0.25

    try:
        from ultralytics import YOLO
        model = YOLO(model_path)
        results = model(image_path, conf=conf, verbose=False)
    except ImportError:
        # ultralytics não instalado — retorna lista vazia silenciosamente
        print("[]"); return
    except Exception as e:
        print(f"[]", file=sys.stderr)
        sys.exit(1)

    detections = []
    for r in results:
        if r.boxes is None:
            continue
        img_w, img_h = r.orig_shape[1], r.orig_shape[0]
        for box in r.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "bbox_x":     round(x1 / img_w, 6),
                "bbox_y":     round(y1 / img_h, 6),
                "bbox_w":     round((x2 - x1) / img_w, 6),
                "bbox_h":     round((y2 - y1) / img_h, 6),
                "confidence": round(float(box.conf[0]), 4),
                "class_id":   int(box.cls[0]),
                "class_name": r.names[int(box.cls[0])]
            })

    print(json.dumps(detections))

if __name__ == "__main__":
    main()
