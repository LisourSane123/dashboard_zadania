#!/usr/bin/env bash
# ──────────────────────────────────────────────────
#  setup_autostart.sh – Konfiguruje autostart kiosku
#  Uruchom RAZ na Raspberry Pi po instalacji
#  Obsługuje: RPi OS Bookworm (Wayland/labwc) i starsze (X11/LXDE)
# ──────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"
KIOSK_SCRIPT="$SCRIPT_DIR/start_kiosk.sh"

echo ""
echo "═══════════════════════════════════════════"
echo "  Setup Dashboard Zadań – Raspberry Pi"
echo "═══════════════════════════════════════════"
echo ""

# ─── 1. Zależności systemowe ───
echo "▶ [1/5] Instalacja zależności systemowych..."
sudo apt-get update -qq

# python3-venv potrzebny do tworzenia venv na Debian/RPi OS
sudo apt-get install -y -qq python3-venv curl 2>/dev/null || true

# Chromium – na RPi OS nazwa pakietu to chromium-browser, na Debian to chromium
if ! command -v chromium-browser &>/dev/null && ! command -v chromium &>/dev/null; then
    sudo apt-get install -y -qq chromium-browser 2>/dev/null || \
    sudo apt-get install -y -qq chromium 2>/dev/null || \
    echo "⚠  Nie udało się zainstalować Chromium. Zainstaluj ręcznie."
fi

# Opcjonalne narzędzia (mogą nie być dostępne na Wayland)
sudo apt-get install -y -qq unclutter 2>/dev/null || true

# ─── 2. Środowisko wirtualne Python ───
echo "▶ [2/5] Tworzenie środowiska wirtualnego Python (venv)..."
if [ -d "$VENV_DIR" ]; then
    echo "  Venv już istnieje, usuwam i tworzę od nowa..."
    rm -rf "$VENV_DIR"
fi
python3 -m venv "$VENV_DIR"
echo "  Venv utworzone: $VENV_DIR"

# ─── 3. Instalacja pakietów Python ───
echo "▶ [3/5] Instalacja pakietów Python w venv..."
"$VENV_DIR/bin/pip" install --upgrade pip -q
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" -q
echo "  Pakiety zainstalowane."

# ─── 4. Uprawnienia ───
echo "▶ [4/5] Nadawanie uprawnień..."
chmod +x "$KIOSK_SCRIPT"

# ─── 5. Konfiguracja autouruchamiania ───
echo "▶ [5/5] Konfiguracja autouruchamiania..."

# Metoda A: XDG autostart (.desktop) – działa na labwc, LXDE i innych DE
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/dashboard-zadania.desktop" << EOF
[Desktop Entry]
Type=Application
Name=Dashboard Zadań
Comment=Kiosk z listą zadań
Exec=bash $KIOSK_SCRIPT
Terminal=false
X-GNOME-Autostart-enabled=true
EOF
echo "  Utworzono: ~/.config/autostart/dashboard-zadania.desktop"

# Metoda B: labwc autostart (RPi OS Bookworm z Wayland)
if [ -d "$HOME/.config/labwc" ] || command -v labwc &>/dev/null; then
    mkdir -p "$HOME/.config/labwc"
    touch "$HOME/.config/labwc/autostart"
    # Usuń stary wpis jeśli istnieje
    sed -i '\|dashboard_zadania|d' "$HOME/.config/labwc/autostart" 2>/dev/null || true
    echo "bash $KIOSK_SCRIPT &" >> "$HOME/.config/labwc/autostart"
    echo "  Dodano wpis do: ~/.config/labwc/autostart"
fi

# Metoda C: LXDE autostart (starsze RPi OS / tryb X11)
LXDE_AUTOSTART_DIR="$HOME/.config/lxsession/LXDE-pi"
if [ -d "$LXDE_AUTOSTART_DIR" ]; then
    AUTOSTART_FILE="$LXDE_AUTOSTART_DIR/autostart"
    if [ -f "$AUTOSTART_FILE" ]; then
        sed -i '\|dashboard_zadania|d' "$AUTOSTART_FILE" 2>/dev/null || true
        echo "@bash $KIOSK_SCRIPT" >> "$AUTOSTART_FILE"
        echo "  Dodano wpis do: $AUTOSTART_FILE"
    fi
fi

# ─── Podsumowanie ───
IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "<adres-ip>")
echo ""
echo "═══════════════════════════════════════════"
echo "  Konfiguracja zakończona!"
echo ""
echo "  Dashboard uruchomi się automatycznie"
echo "  po restarcie Raspberry Pi."
echo ""
echo "  Aby uruchomić teraz:"
echo "    bash $KIOSK_SCRIPT"
echo ""
echo "  Panel administracyjny dostępny pod:"
echo "    http://${IP_ADDR}:5000/admin"
echo "═══════════════════════════════════════════"
