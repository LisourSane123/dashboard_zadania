# 📋 Dashboard Zadań – Raspberry Pi 5

Aplikacja do wyświetlania zadań na ekranie dotykowym 7" podłączonym do Raspberry Pi 5.

## Funkcje

- **Ekran dotykowy** – lista zadań do wykonania, przeciągnięcie w lewo = wykonano
- **Zadania jednorazowe** – znikają po wykonaniu
- **Zadania cykliczne** – pojawiają się ponownie wg ustawionej częstotliwości
- **Panel administracyjny** – dodawanie, edycja, usuwanie zadań przez przeglądarkę
- **Tryb uśpienia** – ekran gaśnie po 15s braku aktywności, budzi się dotykiem
- **Tryb nocny** – ekran wyłączony w godzinach 0:00–5:00
- **Tryb kiosku** – brak możliwości wyjścia z aplikacji na ekranie

## Struktura

```
dashboard_zadania/
├── app.py                  # Serwer Flask (backend + API)
├── database.py             # Warstwa bazy danych SQLite
├── requirements.txt        # Zależności Python
├── start_kiosk.sh          # Uruchamia kiosk (Chromium fullscreen)
├── setup_autostart.sh      # Konfiguruje autostart na RPi
├── templates/
│   ├── dashboard.html      # Widok ekranu dotykowego
│   └── admin.html          # Panel zarządzania zadaniami
└── static/
    ├── css/
    │   ├── dashboard.css
    │   └── admin.css
    └── js/
        ├── dashboard.js    # Logika ekranu (swipe, sleep, night mode)
        └── admin.js        # Logika panelu administracyjnego
```

## Instalacja na Raspberry Pi 5

### 1. Sklonuj/skopiuj projekt

```bash
# Skopiuj folder dashboard_zadania na Raspberry Pi
scp -r dashboard_zadania/ pi@<adres-ip>:~/
```

### 2. Uruchom konfigurację

```bash
cd ~/dashboard_zadania
chmod +x setup_autostart.sh start_kiosk.sh
bash setup_autostart.sh
```

Skrypt zainstaluje potrzebne pakiety, skonfiguruje autostart i nada uprawnienia.

### 3. Uruchom teraz (opcjonalnie)

```bash
bash start_kiosk.sh
```

### 4. Lub zrestartuj Raspberry Pi

```bash
sudo reboot
```

Dashboard uruchomi się automatycznie po restarcie.

## Użytkowanie

### Ekran dotykowy (Dashboard)
- Zadania wyświetlają się automatycznie
- **Przeciągnij zadanie w lewo** aby oznaczyć jako wykonane
- Po wykonaniu wszystkich zadań pojawi się komunikat „Wszystkie zadania wykonane!"
- Ekran wygasa po 15s – dotknij aby obudzić
- W godzinach 0:00–5:00 ekran jest nieaktywny

### Panel administracyjny
Otwórz w przeglądarce na innym urządzeniu:

```
http://<adres-ip-raspberry>:5000/admin
```

Możesz:
- ➕ Dodać zadanie jednorazowe lub cykliczne
- ✏️ Edytować częstotliwość zadania cyklicznego
- 🗑️ Usunąć zadanie

### Częstotliwość zadań cyklicznych
- **Dni** – co X dni (np. co 1 dzień = codziennie)
- **Tygodnie** – co X tygodni
- **Miesiące** – co X miesięcy

## Wymagania

- Raspberry Pi 5 z Raspberry Pi OS (Desktop)
- Ekran dotykowy 7" (oficjalny lub kompatybilny)
- Python 3.11+
- Chromium (preinstalowany w RPi OS)

## Uruchamianie deweloperskie (bez kiosku)

```bash
pip install flask
python3 app.py
```

Następnie otwórz:
- Dashboard: `http://localhost:5000/`
- Admin: `http://localhost:5000/admin`
