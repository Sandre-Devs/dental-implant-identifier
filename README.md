# 🦷 DII — Dental Implant Identifier

Sistema de identificação de fabricante, tipo e compatibilidade de implantes dentários via radiografias panorâmicas e periapicais, com dashboard de anotação para treinamento de modelos de ML.

**Domínio:** [dii.sandre.dev](https://dii.sandre.dev)  
**Repositório:** [github.com/Sandre-Devs/dental-implant-identifier](https://github.com/Sandre-Devs/dental-implant-identifier)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend API | Node.js + Express |
| Banco de dados | SQLite (better-sqlite3) |
| Autenticação | JWT (access 1h + refresh 7d) |
| Upload | Multer + Sharp |
| Hospedagem | Plesk (Passenger) |

---

## Estrutura

```
dii/
├── server.js                  ← Entrada da aplicação
├── package.json
├── passenger.json             ← Plesk Passenger config
├── ecosystem.config.js        ← PM2 config
├── .env.example               ← Template de variáveis
├── database/
│   ├── db.js                  ← Conexão SQLite
│   └── schema.sql             ← Schema completo (10 tabelas)
├── middleware/
│   ├── auth.js                ← JWT verify + role check
│   └── upload.js              ← Multer + validação de tipo
├── routes/
│   ├── auth.js                ← Login, refresh, /me
│   ├── users.js               ← CRUD de usuários
│   ├── images.js              ← Upload e gestão de radiografias
│   ├── annotations.js         ← Anotações + revisão
│   ├── manufacturers.js       ← Fabricantes, sistemas, componentes
│   ├── datasets.js            ← Datasets de treino
│   └── models.js              ← Modelos ML + fila de jobs
├── scripts/
│   ├── create-admin.js        ← Cria usuário admin
│   └── seed-manufacturers.js  ← Popula 10 fabricantes + sistemas
├── uploads/                   ← Radiografias enviadas (git-ignored)
├── data/                      ← Banco SQLite (git-ignored)
└── public/                    ← Build do frontend React (git-ignored)
```

---

## Instalação no Plesk (SSH)

```bash
# 1. Clonar
cd /httpdocs
git clone https://github.com/Sandre-Devs/dental-implant-identifier dii
cd dii

# 2. Instalar dependências
npm install

# 3. Configurar ambiente
cp .env.example .env
nano .env   # Ajuste JWT_SECRET e ADMIN_PASSWORD

# 4. Popular banco
node scripts/create-admin.js
node scripts/seed-manufacturers.js

# 5. Subir via Plesk
# Plesk → Node.js → Application root: /httpdocs/dii
# Startup file: server.js
# Reiniciar app
```

---

## Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | ❌ | Login |
| POST | `/api/auth/refresh` | ❌ | Renovar token |
| GET  | `/api/auth/me` | ✅ | Dados do usuário atual |
| POST | `/api/auth/change-password` | ✅ | Trocar senha |
| GET  | `/api/images` | ✅ | Listar radiografias |
| POST | `/api/images/upload` | ✅ | Upload de imagens |
| GET  | `/api/images/:id/file` | ✅ | Servir arquivo |
| GET  | `/api/annotations?image_id=` | ✅ | Anotações de uma imagem |
| POST | `/api/annotations` | ✅ | Criar anotação |
| POST | `/api/annotations/:id/review` | reviewer | Aprovar/rejeitar |
| GET  | `/api/manufacturers` | ✅ | Fabricantes + sistemas |
| POST | `/api/datasets/:id/add-approved` | reviewer | Montar dataset |
| POST | `/api/datasets/:id/export` | reviewer | Exportar para YOLO/COCO |
| POST | `/api/models/train` | admin | Iniciar treino |
| POST | `/api/models/:id/deploy` | admin | Deployar modelo |
| GET  | `/api/health` | ❌ | Health check |

---

## Roles

| Role | Permissões |
|---|---|
| `admin` | Acesso total |
| `reviewer` | Aprovar/rejeitar anotações, gerenciar datasets |
| `annotator` | Upload + anotar imagens |
| `viewer` | Somente leitura |

---

## Licença

Proprietário — Sandre Devs © 2026
