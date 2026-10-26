SCRIPT = r'''#!/bin/bash
set -euo pipefail

FUNC="__FUNC__"
CODE="__CODE__"
PORT=8443
DIR=/opt/pricebot

if [ "$(id -u)" != "0" ]; then echo "Запустите команду от root"; exit 1; fi

echo "== 1/6 Пакеты системы"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3 python3-venv python3-pip openssl ufw curl ca-certificates

echo "== 2/6 Пользователь и папка"
id pricebot >/dev/null 2>&1 || useradd -r -m -d "$DIR" -s /usr/sbin/nologin pricebot
mkdir -p "$DIR/data" "$DIR/browsers"

echo "== 3/6 Программа"
curl -fsS -X POST "$FUNC" -H 'Content-Type: application/json' \
  -d "{\"action\":\"vps_file\",\"code\":\"$CODE\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);c=d.get('content');sys.exit(d.get('error') or 'нет файла') if not c else sys.stdout.write(c)" \
  > "$DIR/server.py"

python3 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install -q --upgrade pip
"$DIR/venv/bin/pip" install -q "aiohttp==3.10.10" "playwright==1.48.0"

echo "== 4/6 Браузер Chromium (самый долгий шаг)"
PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers" "$DIR/venv/bin/playwright" install --with-deps chromium

echo "== 5/6 Ключ, сертификат, автозапуск"
if [ ! -f "$DIR/env" ]; then
  KEY=$(openssl rand -hex 32)
  printf 'VPS_KEY=%s\nVPS_PORT=%s\nSITE_FUNC=%s\nPLAYWRIGHT_BROWSERS_PATH=%s/browsers\n' "$KEY" "$PORT" "$FUNC" "$DIR" > "$DIR/env"
fi
KEY=$(grep '^VPS_KEY=' "$DIR/env" | cut -d= -f2)
if [ ! -f "$DIR/cert.pem" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=pricebot" \
    -keyout "$DIR/key.pem" -out "$DIR/cert.pem" 2>/dev/null
fi
FP=$(openssl x509 -in "$DIR/cert.pem" -outform DER | sha256sum | cut -d' ' -f1)
chown -R pricebot:pricebot "$DIR"
chmod 600 "$DIR/env" "$DIR/key.pem"

cat > /etc/systemd/system/pricebot.service <<EOF
[Unit]
Description=Pricebot browser server
After=network-online.target
Wants=network-online.target

[Service]
User=pricebot
WorkingDirectory=$DIR
EnvironmentFile=$DIR/env
ExecStart=$DIR/venv/bin/python $DIR/server.py
Restart=always
RestartSec=3
MemoryMax=3G

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable pricebot >/dev/null
systemctl restart pricebot

ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow $PORT/tcp >/dev/null
ufw --force enable >/dev/null

echo "== 6/6 Регистрация на сайте"
for i in $(seq 1 20); do
  curl -fsk -o /dev/null -X POST -H "X-Key: $KEY" "https://127.0.0.1:$PORT/ping" && break
  sleep 2
done
RES=$(curl -sS -X POST "$FUNC" -H 'Content-Type: application/json' \
  -d "{\"action\":\"vps_register\",\"code\":\"$CODE\",\"key\":\"$KEY\",\"port\":$PORT,\"fingerprint\":\"$FP\"}")
echo "$RES" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ГОТОВО: сервер на связи с сайтом' if d.get('ok') else 'ОШИБКА: '+str(d.get('error')))"
'''
