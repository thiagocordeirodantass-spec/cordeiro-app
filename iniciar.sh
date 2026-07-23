#!/usr/bin/env bash
# Script de inicializacao - NF-e / CT-e Consulta (Linux / macOS)
set -e
echo "============================================================"
echo " NF-e / CT-e - Consulta Local"
echo "============================================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js nao encontrado."
  echo
  echo "Instale o Node.js:"
  echo "  1) Acesse https://nodejs.org/"
  echo "  2) Baixe a versao LTS (recomendada)"
  echo "  3) Instale e reabra o terminal"
  echo
  exit 1
fi

echo "[OK] Node.js encontrado:"
node -v
echo

cd "$(dirname "$0")/backend"

if [ -d "node_modules" ]; then
  echo "[OK] Dependencias ja incluidas na pasta (node_modules). Pulando npm."
else
  echo "Pasta node_modules nao encontrada. Tentando 'npm install' (precisa de internet)..."
  if ! command -v npm >/dev/null 2>&1; then
    echo "[ERRO] npm nao encontrado e node_modules ausente."
    echo "Copie novamente a pasta 'backend/node_modules' do pacote original,"
    echo "ou instale o npm junto com o Node.js."
    exit 1
  fi
  npm install
fi

echo
echo "Iniciando servidor..."
echo "Acesse: http://localhost:3000"
echo "Pressione Ctrl+C para parar."
echo
node server.js
