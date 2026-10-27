SCRIPT = r'''#!/bin/bash
set -euo pipefail

FUNC="__FUNC__"
CODE="__CODE__"
PORT=8443
DIR=/opt/pricebot
STEP="подготовка"

trap 'echo; echo "ОШИБКА на шаге: $STEP. Пришлите Юре последние строки отсюда."' ERR

if [ "$(id -u)" != "0" ]; then echo "Запустите команду от root"; exit 1; fi
echo $$ > /root/pricebot-install.pid

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=l
export NEEDRESTART_SUSPEND=1
mkdir -p /etc/needrestart/conf.d
echo "\$nrconf{restart} = 'l';" > /etc/needrestart/conf.d/90-pricebot.conf
APT="apt-get -y -q -o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold"

STEP="1/6 Пакеты системы"; echo "== $STEP"
$APT update
$APT install python3 python3-venv python3-pip openssl ufw curl ca-certificates iproute2

STEP="2/6 Пользователь и папка"; echo "== $STEP"
id pricebot >/dev/null 2>&1 || useradd -r -m -d "$DIR" -s /usr/sbin/nologin pricebot
mkdir -p "$DIR/data" "$DIR/browsers"

STEP="3/6 Программа"; echo "== $STEP"
curl -4 -fsS -X POST "$FUNC" -H 'Content-Type: application/json' \
  -d "{\"action\":\"vps_file\",\"code\":\"$CODE\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);c=d.get('content');sys.exit(d.get('error') or 'нет файла') if not c else sys.stdout.write(c)" \
  > "$DIR/server.py"
python3 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install -q --upgrade pip
"$DIR/venv/bin/pip" install -q "aiohttp==3.10.10" "playwright==1.48.0"

STEP="4/6 Браузер Chromium (самый долгий шаг)"; echo "== $STEP"
PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers" "$DIR/venv/bin/playwright" install --with-deps chromium

STEP="5/6 Ключ, сертификат, автозапуск, порты"; echo "== $STEP"
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

SSH_PORTS=$( { sshd -T 2>/dev/null | awk '/^port /{print $2}'; ss -tlnpH 2>/dev/null | grep -w sshd | awk '{print $4}' | sed 's/.*://'; } | sort -u || true)
[ -z "$SSH_PORTS" ] && SSH_PORTS=22
SKIP="$PORT|53|$(echo $SSH_PORTS | tr ' ' '|')"
OTHER=$(ss -tlnH 2>/dev/null | awk '{print $4}' | grep -v -E '^(127\.|\[::1\]|::1)' \
  | sed 's/.*://' | grep -v -E "^($SKIP)$" | sort -u || true)
for p in $SSH_PORTS; do ufw allow "$p/tcp" >/dev/null; done
ufw allow "$PORT/tcp" >/dev/null
if [ -z "$OTHER" ]; then
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw --force enable >/dev/null
  echo "Порты: открыты только вход на сервер ($(echo $SSH_PORTS)) и программа ($PORT)"
else
  echo "На сервере есть другие службы (порты: $(echo $OTHER)) — лишнее не закрываю, только открыл $PORT"
fi

STEP="6/6 Регистрация на сайте"; echo "== $STEP"
for i in $(seq 1 30); do
  curl -fsk -o /dev/null -X POST -H "X-Key: $KEY" "https://127.0.0.1:$PORT/ping" && break
  sleep 2
done
RES=$(curl -4 -sS -X POST "$FUNC" -H 'Content-Type: application/json' \
  -d "{\"action\":\"vps_register\",\"code\":\"$CODE\",\"key\":\"$KEY\",\"port\":$PORT,\"fingerprint\":\"$FP\"}")
echo "$RES" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ГОТОВО: сервер на связи с сайтом' if d.get('ok') else 'ОШИБКА: '+str(d.get('error')))"
'''