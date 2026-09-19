#!/usr/bin/env bash
# =============================================================================
# Expõe o dev server local por um túnel do Cloudflare, para a UAZAPI conseguir
# chamar o webhook. Uso, com o `npm run dev` já rodando noutro terminal:
#
#   npm run tunel
#
# Usa um "quick tunnel" (*.trycloudflare.com): não precisa de conta nem de
# domínio, mas o endereço MUDA a cada vez que o túnel sobe. Por isso o script:
#
#   1. sobe o túnel e descobre o endereço;
#   2. grava esse endereço em NEXT_PUBLIC_APP_URL no .env.local — é dali que
#      sai a URL de webhook entregue à UAZAPI e o link do e-mail de cadastro;
#   3. ao sair (Ctrl+C), devolve o .env.local para http://localhost:3000.
#
# O passo 3 importa: um .env.local apontando para um túnel morto faria as
# próximas conexões gravarem na UAZAPI um webhook que não responde — e isso
# não dá erro nenhum, só faz as mensagens pararem de chegar.
#
# O app reapontar o webhook a cada "Gerar código" (app/actions/conexao.ts) é o
# que torna isto seguro de repetir: basta gerar o QR de novo com o túnel novo.
# =============================================================================
set -euo pipefail

PORTA=${PORT:-3000}
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV="$RAIZ/.env.local"
LOCAL="http://localhost:$PORTA"

command -v cloudflared >/dev/null || { echo "instale antes: brew install cloudflared"; exit 1; }
[ -f "$ENV" ] || { echo "falta o .env.local"; exit 1; }

if ! curl -s -o /dev/null -m 3 "$LOCAL/login"; then
    echo "o dev server não está respondendo em $LOCAL — rode 'npm run dev' antes"
    exit 1
fi

aponta() { perl -pi -e "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=$1|" "$ENV"; }

LOG=$(mktemp -t zonanova-tunel)
cloudflared tunnel --no-autoupdate --url "$LOCAL" >"$LOG" 2>&1 &
PID=$!

limpar() {
    kill "$PID" 2>/dev/null || true
    aponta "$LOCAL"
    rm -f "$LOG"
    echo
    echo "túnel fechado. NEXT_PUBLIC_APP_URL voltou para $LOCAL"
}
trap limpar EXIT INT TERM

URL=""
for _ in $(seq 1 60); do
    URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
    [ -n "$URL" ] && break
    kill -0 "$PID" 2>/dev/null || { cat "$LOG"; exit 1; }
    sleep 0.5
done
[ -n "$URL" ] || { echo "o túnel não informou endereço em 30s:"; cat "$LOG"; exit 1; }

aponta "$URL"

# O DNS do trycloudflare leva alguns segundos para propagar. A espera é feita
# perguntando ao DNS PÚBLICO do Cloudflare, nunca ao da máquina: a primeira
# versão fazia `curl` no endereço novo, e cada tentativa antes de propagar
# ensinava ao resolvedor local que o domínio não existia. Esse "não existe"
# fica em cache — o túnel funcionava e o navegador da própria máquina seguia
# dizendo que o endereço não existe.
HOST=${URL#https://}
for _ in $(seq 1 60); do
    [ -n "$(dig +short @1.1.1.1 "$HOST" 2>/dev/null)" ] && break
    sleep 1
done

cat <<EOF

  túnel no ar:  $URL

  - NEXT_PUBLIC_APP_URL no .env.local agora aponta para ele (o dev server
    recarrega o .env.local sozinho).
  - Abra o app POR ESTE ENDEREÇO, não por localhost: o link do e-mail de
    cadastro e o webhook da UAZAPI saem daqui.
  - Se o túnel reiniciar, o endereço muda: clique "Gerar código" de novo em
    /conectar para reapontar o webhook.
  - Se o navegador disser que o endereço não existe, espere um minuto: é o
    cache de DNS da máquina, não o túnel.

  Ctrl+C para fechar.

EOF

wait "$PID"
