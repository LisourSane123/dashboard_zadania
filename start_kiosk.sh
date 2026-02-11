#!/usr/bin/env bash
# ──────────────────────────────────────────────────
#  start_kiosk.sh – Uruchamia dashboard w trybie kiosku
#  na Raspberry Pi 5 z ekranem dotykowym 7"
#  Obsługuje: Wayland (labwc) i X11 (LXDE)
# ──────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"
SERVER_PORT=5000
DASHBOARD_URL="http://localhost:${SERVER_PORT}/"

# ─── Sprawdź venv ───
if [ ! -d "$VENV_DIR" ]; then
    echo "⚠  Venv nie znalezione w $VENV_DIR"
    echo "   Uruchom najpierw: bash $SCRIPT_DIR/setup_autostart.sh"
    exit 1
fi

echo "▶ Uruchamianie serwera Flask..."
cd "$SCRIPT_DIR"

# Zabij poprzednie instancje
pkill -f "python.*app.py" 2>/dev/null || true
sleep 1

# Uruchom serwer z venv Python
"$VENV_DIR/bin/python" app.py &
SERVER_PID=$!
echo "  Serwer PID: $SERVER_PID"

# Poczekaj aż serwer będzie gotowy
echo "  Czekam na serwer..."
SERVER_READY=0
for i in $(seq 1 30); do
    if curl -s -o /dev/null "http://localhost:${SERVER_PORT}/"; then
        echo "  Serwer gotowy!"
        SERVER_READY=1
        break
    fi
    sleep 1
done

if [ "$SERVER_READY" -eq 0 ]; then
    echo "⚠  Serwer nie odpowiada po 30s. Kontynuuję mimo to..."
fi

# ─── Konfiguracja ekranu ───
# Wykryj serwer wyświetlania i dostosuj ustawienia
if [ -n "${WAYLAND_DISPLAY:-}" ]; then
    echo "  Środowisko: Wayland"
    CHROMIUM_PLATFORM_FLAGS="--ozone-platform=wayland"
else
    echo "  Środowisko: X11"
    CHROMIUM_PLATFORM_FLAGS=""
    export DISPLAY="${DISPLAY:-:0}"

    # Wyłącz screensaver i power management (tylko X11)
    xset s off 2>/dev/null || true
    xset -dpms 2>/dev/null || true
    xset s noblank 2>/dev/null || true
fi

# Schowaj kursor myszy (jeśli unclutter dostępny)
if command -v unclutter &>/dev/null; then
    killall unclutter 2>/dev/null || true
    unclutter -idle 0.5 -root &>/dev/null &
fi

# ─── Znajdź przeglądarkę Chromium ───
CHROMIUM=""
for cmd in chromium-browser chromium; do
    if command -v "$cmd" &>/dev/null; then
        CHROMIUM="$cmd"
        break
    fi
done

if [ -z "$CHROMIUM" ]; then
    echo "⚠  Nie znaleziono przeglądarki Chromium!"
    echo "   Zainstaluj: sudo apt install chromium-browser"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

echo "▶ Uruchamianie $CHROMIUM w trybie kiosku..."

# Wyczyść flagi awaryjnego zamknięcia
CHROMIUM_PREFS="$HOME/.config/chromium/Default/Preferences"
if [ -f "$CHROMIUM_PREFS" ]; then
    sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' "$CHROMIUM_PREFS" 2>/dev/null || true
    sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "$CHROMIUM_PREFS" 2>/dev/null || true
fi

$CHROMIUM \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --disable-gpu \
    --disable-software-rasterizer \
    --disable-background-networking \
    --disable-sync \
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
    $CHROMIUM_PLATFORM_FLAGS \
    "$DASHBOARD_URL" &

BROWSER_PID=$!
echo "  Chromium PID: $BROWSER_PID"

# ─── Czekaj i sprzątaj ───
cleanup() {
    echo "▶ Zamykanie kiosku..."
    kill $SERVER_PID 2>/dev/null || true
    kill $BROWSER_PID 2>/dev/null || true
    killall unclutter 2>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

wait $BROWSER_PID
echo "▶ Kiosk zamknięty."
