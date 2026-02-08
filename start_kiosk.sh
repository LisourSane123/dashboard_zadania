#!/usr/bin/env bash
# ──────────────────────────────────────────────────
#  start_kiosk.sh – Uruchamia dashboard w trybie kiosku
#  na Raspberry Pi 5 z ekranem dotykowym 7"
# ──────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PORT=5000
DASHBOARD_URL="http://localhost:${SERVER_PORT}/"

echo "▶ Uruchamianie serwera Flask..."
cd "$SCRIPT_DIR"

# Zabij poprzednie instancje
pkill -f "python.*app.py" 2>/dev/null || true
sleep 1

# Uruchom serwer w tle
python3 app.py &
SERVER_PID=$!
echo "  Serwer PID: $SERVER_PID"

# Poczekaj aż serwer będzie gotowy
echo "  Czekam na serwer..."
for i in $(seq 1 30); do
    if curl -s -o /dev/null "http://localhost:${SERVER_PORT}/"; then
        echo "  Serwer gotowy!"
        break
    fi
    sleep 1
done

# ─── Konfiguracja ekranu ───
# Wyłącz screensaver i power management (obsługujemy to sami w JS)
export DISPLAY=:0
xset s off 2>/dev/null || true
xset -dpms 2>/dev/null || true
xset s noblank 2>/dev/null || true

# Schowaj kursor myszy
unclutter -idle 0.1 -root &>/dev/null &

# ─── Uruchom Chromium w trybie kiosku ───
echo "▶ Uruchamianie Chromium w trybie kiosku..."

# Wyczyść flagi awaryjnego zamknięcia (żeby nie było paska "Przywróć sesję")
if [ -d "$HOME/.config/chromium/Default" ]; then
    sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' \
        "$HOME/.config/chromium/Default/Preferences" 2>/dev/null || true
    sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' \
        "$HOME/.config/chromium/Default/Preferences" 2>/dev/null || true
fi

chromium-browser \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --kiosk \
    --incognito \
    --disable-translate \
    --disable-features=TranslateUI \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --no-first-run \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    --start-fullscreen \
    --window-size=1024,600 \
    --window-position=0,0 \
    "$DASHBOARD_URL" &

BROWSER_PID=$!
echo "  Chromium PID: $BROWSER_PID"

# ─── Czekaj i sprzątaj ───
trap "kill $SERVER_PID $BROWSER_PID 2>/dev/null; exit" SIGINT SIGTERM

wait $BROWSER_PID
kill $SERVER_PID 2>/dev/null || true
echo "▶ Kiosk zamknięty."
