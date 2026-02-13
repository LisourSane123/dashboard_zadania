#!/usr/bin/env bash
# ──────────────────────────────────────────────────
#  start_kiosk.sh – Uruchamia dashboard w trybie kiosku
#  na Raspberry Pi 5 z ekranem dotykowym 7"
#  Obsługuje: Wayland (labwc) i X11 (LXDE)
# ──────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"
KIOSK_PROFILE="$SCRIPT_DIR/.chromium-kiosk"
SERVER_PORT=5000
DASHBOARD_URL="http://localhost:${SERVER_PORT}/"

# ─── Blokada wielu instancji (flock) ───
LOCKFILE="/tmp/dashboard-kiosk.lock"
exec 200>"$LOCKFILE"
if ! flock -n 200; then
    echo "⚠  Inna instancja kiosku już działa. Kończę."
    exit 0
fi

# ─── Sprawdź venv ───
if [ ! -d "$VENV_DIR" ]; then
    echo "⚠  Venv nie znalezione w $VENV_DIR"
    echo "   Uruchom najpierw: bash $SCRIPT_DIR/setup_autostart.sh"
    exit 1
fi

echo "▶ Uruchamianie serwera Flask..."
cd "$SCRIPT_DIR"

# Przy starcie systemu poczekaj na stabilizację (sieć, ekran, usługi)
if [ "$(cat /proc/uptime | cut -d. -f1)" -lt 60 ] 2>/dev/null; then
    echo "  System świeżo uruchomiony – czekam 10s na stabilizację..."
    sleep 10
fi

# Zabij poprzednie instancje serwera
pkill -f "python.*app.py" 2>/dev/null || true

# Zabij KAŻDĄ instancję Chromium — inaczej nowy --kiosk
# otworzy URL w istniejącej sesji i natychmiast zakończy proces
killall -q chromium-browser 2>/dev/null || true
killall -q chromium 2>/dev/null || true
pkill -f chromium 2>/dev/null || true
sleep 3

# Uruchom serwer z venv Python
"$VENV_DIR/bin/python" app.py &
SERVER_PID=$!
echo "  Serwer PID: $SERVER_PID"

# Poczekaj aż serwer będzie gotowy (do 60 sekund)
echo "  Czekam na serwer..."
SERVER_READY=0
for i in $(seq 1 60); do
    if curl -s -o /dev/null -w '' "http://localhost:${SERVER_PORT}/" 2>/dev/null; then
        echo "  Serwer gotowy! (po ${i}s)"
        SERVER_READY=1
        break
    fi
    sleep 1
done

if [ "$SERVER_READY" -eq 0 ]; then
    echo "⚠  Serwer nie odpowiada po 60s. Sprawdzam czy proces żyje..."
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo "✖  Proces serwera nie żyje. Próbuję ponownie..."
        "$VENV_DIR/bin/python" app.py &
        SERVER_PID=$!
    fi
    # Czekaj kolejne 60s
    for i in $(seq 1 60); do
        if curl -s -o /dev/null -w '' "http://localhost:${SERVER_PORT}/" 2>/dev/null; then
            echo "  Serwer gotowy! (po dodatkowych ${i}s)"
            SERVER_READY=1
            break
        fi
        sleep 1
    done
fi

if [ "$SERVER_READY" -eq 0 ]; then
    echo "✖  Serwer nie odpowiada po 120s. Restartuję..."
    kill $SERVER_PID 2>/dev/null || true
    sleep 2
    "$VENV_DIR/bin/python" app.py &
    SERVER_PID=$!
    sleep 5
fi

# ─── Konfiguracja ekranu ───
CHROMIUM_PLATFORM_FLAGS=""
if [ -n "${WAYLAND_DISPLAY:-}" ]; then
    echo "  Środowisko: Wayland"
    CHROMIUM_PLATFORM_FLAGS="--ozone-platform=wayland"
else
    echo "  Środowisko: X11"
    export DISPLAY="${DISPLAY:-:0}"
    xset s off 2>/dev/null || true
    xset -dpms 2>/dev/null || true
    xset s noblank 2>/dev/null || true
fi

# Schowaj kursor myszy
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

# Dedykowany profil kiosku — gwarantuje nową, osobną instancję
mkdir -p "$KIOSK_PROFILE/Default"

# Wyczyść flagi awaryjnego zamknięcia w profilu kiosku
KIOSK_PREFS="$KIOSK_PROFILE/Default/Preferences"
if [ -f "$KIOSK_PREFS" ]; then
    sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' "$KIOSK_PREFS" 2>/dev/null || true
    sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "$KIOSK_PREFS" 2>/dev/null || true
fi

# Usuń stale lock pliki Chromium (mogą powodować "Opening in existing browser session")
# Wyczyść cache przeglądarki kiosku
rm -rf "$KIOSK_PROFILE/Default/Cache" "$KIOSK_PROFILE/Default/Code Cache" 2>/dev/null || true

rm -f "$KIOSK_PROFILE/SingletonLock" "$KIOSK_PROFILE/SingletonSocket" "$KIOSK_PROFILE/SingletonCookie" 2>/dev/null || true

$CHROMIUM \
    --user-data-dir="$KIOSK_PROFILE" \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --disable-gpu \
    --disable-background-networking \
    --disable-sync \
    --disable-extensions \
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
    --remote-debugging-port=9222 \    --remote-debugging-address=0.0.0.0 \    $CHROMIUM_PLATFORM_FLAGS \
    "$DASHBOARD_URL" &

BROWSER_PID=$!
echo "  Chromium PID: $BROWSER_PID"

# Zabezpieczenie: jeśli serwer nie był od razu gotowy → odśwież po starcie
sleep 3
if command -v xdotool &>/dev/null; then
    xdotool key --clearmodifiers F5 2>/dev/null || true
fi

# ─── Czekaj i sprzątaj ───
cleanup() {
    echo "▶ Zamykanie kiosku..."
    kill $SERVER_PID 2>/dev/null || true
    kill $BROWSER_PID 2>/dev/null || true
    killall unclutter 2>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

# Monitoruj Chromium – jeśli zamknie się za szybko (<30s), ponów próbę
CHROMIUM_START=$(date +%s)
wait $BROWSER_PID 2>/dev/null
CHROMIUM_RUNTIME=$(( $(date +%s) - CHROMIUM_START ))

if [ "$CHROMIUM_RUNTIME" -lt 30 ]; then
    echo "⚠  Chromium zamknął się po ${CHROMIUM_RUNTIME}s. Ponawiam za 5s..."
    sleep 5

    # Wyczyść wszystko i spróbuj ponownie
    killall -q chromium-browser 2>/dev/null || true
    killall -q chromium 2>/dev/null || true
    pkill -f chromium 2>/dev/null || true
    sleep 3
    rm -f "$KIOSK_PROFILE/SingletonLock" "$KIOSK_PROFILE/SingletonSocket" "$KIOSK_PROFILE/SingletonCookie" 2>/dev/null || true

    $CHROMIUM \
        --user-data-dir="$KIOSK_PROFILE" \
        --noerrdialogs \
        --disable-infobars \
        --disable-session-crashed-bubble \
        --disable-restore-session-state \
        --disable-gpu \
        --disable-background-networking \
        --disable-sync \
        --disable-extensions \
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
    echo "  Chromium ponownie uruchomiony, PID: $BROWSER_PID"
    wait $BROWSER_PID 2>/dev/null
fi

echo "▶ Kiosk zamknięty."
