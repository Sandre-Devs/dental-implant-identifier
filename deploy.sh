#!/bin/bash
# deploy.sh — atualiza e reinicia o DII com segurança
# Uso: bash deploy.sh
# O script garante que processos antigos são encerrados antes de subir os novos

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo ""
echo "DII Deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "==========================================="

# 1. Pull
echo "[1/6] Git pull..."
git pull origin main

# 2. Instalar dependências novas (se houver)
echo "[2/6] npm install..."
npm install --omit=dev --silent

# 3. Build do frontend
echo "[3/6] Build do frontend..."
cd frontend && npm install --silent && npm run build && cd ..

# 4. Matar qualquer processo Node na porta 3001 (processo órfão)
echo "[4/6] Liberando porta 3001..."
PORT_PID=$(lsof -ti :3001 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
  echo "  -> Encerrando PID $PORT_PID na porta 3001"
  kill -9 $PORT_PID 2>/dev/null || true
  sleep 1
fi

# 5. PM2 — reload gracioso (zero downtime) ou start se não existir
echo "[5/6] PM2 restart..."
if pm2 list | grep -q "dii-backend"; then
  pm2 reload ecosystem.config.js --env production --update-env
else
  pm2 start ecosystem.config.js --env production
  pm2 save
fi

# 6. Status final
echo "[6/6] Status:"
pm2 list

echo ""
echo "Deploy concluído!"
