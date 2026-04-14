#!/bin/bash
# scripts/setup-sqlite-web.sh
# Instala e configura o sqlite-web como painel visual do banco DII
# Acesso: http://seudominio.com:8080  (ou via proxy reverso no Plesk)

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="$DIR/data/dii.db"
PORT=${SQLITE_WEB_PORT:-8080}
HOST=${SQLITE_WEB_HOST:-127.0.0.1}  # só localhost por padrão (seguro)

echo ""
echo "DII — Setup SQLite Web"
echo "======================"

# 1. Instalar sqlite-web
echo "[1/3] Instalando sqlite-web..."
if command -v pip3 &>/dev/null; then
  pip3 install sqlite-web
elif command -v pip &>/dev/null; then
  pip install sqlite-web
else
  echo "ERRO: pip não encontrado. Instale Python pip primeiro."
  exit 1
fi

# 2. Verificar instalação
if ! command -v sqlite_web &>/dev/null; then
  # Tentar no venv-ml se existir
  if [ -f "$DIR/venv-ml/bin/sqlite_web" ]; then
    SQLITE_WEB_BIN="$DIR/venv-ml/bin/sqlite_web"
  else
    echo "ERRO: sqlite_web não encontrado no PATH após instalação."
    echo "Tente: pip3 install sqlite-web --break-system-packages"
    exit 1
  fi
else
  SQLITE_WEB_BIN=$(which sqlite_web)
fi

echo "  sqlite_web: $SQLITE_WEB_BIN"

# 3. Registrar no PM2
echo "[2/3] Registrando no PM2..."
pm2 delete dii-sqlite-web 2>/dev/null || true

pm2 start "$SQLITE_WEB_BIN" \
  --name "dii-sqlite-web" \
  --interpreter none \
  -- \
  "$DB_PATH" \
  --host "$HOST" \
  --port "$PORT" \
  --read-only \
  --no-browser

pm2 save

echo "[3/3] Configurando proxy no Plesk..."
echo ""
echo "+----------------------------------------------------------+"
echo "|  SQLite Web rodando!                                     |"
echo "|                                                          |"
echo "|  Acesso local:  http://127.0.0.1:$PORT                  |"
echo "|                                                          |"
echo "|  Para acessar externamente, configure no Plesk:         |"
echo "|  Domínios -> sandre.dev -> Apache & nginx ->            |"
echo "|  Diretivas adicionais nginx:                            |"
echo "|                                                          |"
echo "|  location /dii-db/ {                                    |"
echo "|    proxy_pass http://127.0.0.1:$PORT/;                  |"
echo "|    auth_basic \"DII Database\";                          |"
echo "|    auth_basic_user_file /etc/nginx/.htpasswd-dii;       |"
echo "|  }                                                       |"
echo "|                                                          |"
echo "|  Acesso: https://sandre.dev/dii-db/                     |"
echo "+----------------------------------------------------------+"
echo ""
echo "  Para criar senha de acesso:"
echo "  python3 $DIR/scripts/create-db-password.py"
echo ""
