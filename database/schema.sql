-- ============================================================
-- DII — Dental Implant Identifier — Schema v1.0.0
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Usuários
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'annotator' CHECK(role IN ('admin','annotator','reviewer','viewer')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fabricantes de implantes
CREATE TABLE IF NOT EXISTS manufacturers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  country     TEXT,
  website     TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sistemas/linhas de implante
CREATE TABLE IF NOT EXISTS implant_systems (
  id               TEXT PRIMARY KEY,
  manufacturer_id  TEXT NOT NULL REFERENCES manufacturers(id),
  name             TEXT NOT NULL,
  connection_type  TEXT NOT NULL CHECK(connection_type IN ('cone_morse','hex_interno','hex_externo','trilobe','octogono','spline','desconhecido')),
  platform         TEXT,
  notes            TEXT,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Componentes compatíveis por sistema
CREATE TABLE IF NOT EXISTS components (
  id            TEXT PRIMARY KEY,
  system_id     TEXT NOT NULL REFERENCES implant_systems(id),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK(type IN ('cicatrizador','munhao','pilar','pilar_angulado','pilar_estetico','protese','outro')),
  diameter      REAL,
  height        REAL,
  notes         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Imagens de radiografias
CREATE TABLE IF NOT EXISTS images (
  id            TEXT PRIMARY KEY,
  filename      TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size          INTEGER NOT NULL,
  width         INTEGER,
  height        INTEGER,
  type          TEXT NOT NULL CHECK(type IN ('panoramica','periapical','oclusal','outro')),
  source        TEXT DEFAULT 'upload' CHECK(source IN ('upload','externo')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','annotating','annotated','reviewed','approved','rejected')),
  notes         TEXT,
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Anotações por imagem (uma imagem pode ter múltiplos implantes)
CREATE TABLE IF NOT EXISTS annotations (
  id              TEXT PRIMARY KEY,
  image_id        TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  annotator_id    TEXT NOT NULL REFERENCES users(id),
  reviewer_id     TEXT REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),

  -- Bounding box normalizada (0–1)
  bbox_x          REAL,
  bbox_y          REAL,
  bbox_w          REAL,
  bbox_h          REAL,

  -- Classificação
  manufacturer_id TEXT REFERENCES manufacturers(id),
  system_id       TEXT REFERENCES implant_systems(id),
  confidence      TEXT DEFAULT 'low' CHECK(confidence IN ('low','medium','high')),

  -- Dados clínicos
  position_fdi    TEXT,       -- ex: "36", "21"
  diameter_mm     REAL,
  length_mm       REAL,
  bone_level      TEXT CHECK(bone_level IN ('crestal','subcrestal','supracrestal',NULL)),
  osseointegrated INTEGER DEFAULT 0,
  notes           TEXT,

  reject_reason   TEXT,
  reviewed_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Datasets para treino
CREATE TABLE IF NOT EXISTS datasets (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  export_format  TEXT NOT NULL DEFAULT 'yolo' CHECK(export_format IN ('yolo','coco','pascal_voc')),
  split_train    REAL NOT NULL DEFAULT 0.7,
  split_val      REAL NOT NULL DEFAULT 0.2,
  split_test     REAL NOT NULL DEFAULT 0.1,
  status         TEXT NOT NULL DEFAULT 'building' CHECK(status IN ('building','ready','exported','archived')),
  image_count    INTEGER DEFAULT 0,
  export_path    TEXT,
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Imagens incluídas em cada dataset
CREATE TABLE IF NOT EXISTS dataset_images (
  id             TEXT PRIMARY KEY,
  dataset_id     TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  image_id       TEXT NOT NULL REFERENCES images(id),
  annotation_id  TEXT NOT NULL REFERENCES annotations(id),
  split          TEXT NOT NULL DEFAULT 'train' CHECK(split IN ('train','val','test')),
  UNIQUE(dataset_id, image_id)
);

-- Modelos ML treinados
CREATE TABLE IF NOT EXISTS ml_models (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  version        TEXT NOT NULL,
  dataset_id     TEXT REFERENCES datasets(id),
  architecture   TEXT DEFAULT 'yolov8m',
  status         TEXT NOT NULL DEFAULT 'training' CHECK(status IN ('training','completed','failed','deployed','archived')),
  epochs         INTEGER,
  map50          REAL,
  map95          REAL,
  precision      REAL,
  recall         REAL,
  model_path     TEXT,
  metrics_json   TEXT,       -- JSON completo com curvas de treino
  notes          TEXT,
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fila de jobs assíncronos (export, treino, inferência)
CREATE TABLE IF NOT EXISTS jobs (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL CHECK(type IN ('export_dataset','train_model','run_inference','generate_report')),
  status         TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  payload        TEXT,       -- JSON com parâmetros do job
  result         TEXT,       -- JSON com resultado/erro
  progress       INTEGER DEFAULT 0,
  requested_by   TEXT NOT NULL REFERENCES users(id),
  started_at     TEXT,
  completed_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inferências executadas pelo modelo em produção
CREATE TABLE IF NOT EXISTS inferences (
  id             TEXT PRIMARY KEY,
  image_id       TEXT NOT NULL REFERENCES images(id),
  model_id       TEXT NOT NULL REFERENCES ml_models(id),
  detections     TEXT,       -- JSON array de detecções
  raw_output     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_images_status       ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_type         ON images(type);
CREATE INDEX IF NOT EXISTS idx_annotations_image   ON annotations(image_id);
CREATE INDEX IF NOT EXISTS idx_annotations_status  ON annotations(status);
CREATE INDEX IF NOT EXISTS idx_annotations_system  ON annotations(system_id);
CREATE INDEX IF NOT EXISTS idx_dataset_images      ON dataset_images(dataset_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status         ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type           ON jobs(type);
