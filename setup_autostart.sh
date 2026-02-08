#!/usr/bin/env bash
# ──────────────────────────────────────────────────
#  setup_autostart.sh – Konfiguruje autostart kiosku
#  Uruchom RAZ na Raspberry Pi po instalacji
# ──────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIOSK_SCRIPT="$SCRIPT_DIR/start_kiosk.sh"

echo "▶ Instalacja zależności systemowych..."
sudo apt-get update -qq
sudo apt-get install -y -qq chromium-browser unclutter xdotool curl

echo "▶ Instalacja zależności Python..."
pip3 install --user -r "$SCRIPT_DIR/requirements.txt"

echo "▶ Konfiguracja autouruchamiania..."

# Stwórz plik autostart dla LXDE (domyślne środowisko RPi)
AUTOSTART_DIR="$HOME/.config/lxsession/LXDE-pi"
mkdir -p "$AUTOSTART_DIR"

# Dodaj wpis autostartu
AUTOSTART_FILE="$AUTOSTART_DIR/autostart"
if [ ! -f "$AUTOSTART_FILE" ]; then
    cat > "$AUTOSTART_FILE" << EOF
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xscreensaver -no-splash
EOF
fi

# Usuń stary wpis jeśli istnieje
sed -i '\|dashboard_zadania|d' "$AUTOSTART_FILE" 2>/dev/null || true

# Dodaj nowy wpis
echo "@bash $KIOSK_SCRIPT" >> "$AUTOSTART_FILE"

echo "▶ Nadawanie uprawnień..."
chmod +x "$KIOSK_SCRIPT"

echo ""
echo "════════════════════════════════════════"
echo "  Konfiguracja zakończona!"
echo "  Dashboard uruchomi się automatycznie"
echo "  po restarcie Raspberry Pi."
echo ""
echo "  Aby uruchomić teraz:"
echo "    bash $KIOSK_SCRIPT"
echo ""
echo "  Panel administracyjny dostępny pod:"
echo "    http://<adres-ip-rpi>:5000/admin"
echo "════════════════════════════════════════"
