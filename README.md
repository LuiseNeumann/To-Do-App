# ✦ Planer App – Todo & Kalender

Eine lokale Todo- und Kalender-App mit Flask-Backend und modernem Frontend.

## Ordnerstruktur

```
todo_calendar_app/
├── app.py                  ← Flask Backend (API + Routing)
├── requirements.txt        ← Python Abhängigkeiten
├── start.bat               ← Starten unter Windows (Doppelklick)
├── start.sh                ← Starten unter Mac/Linux
├── data/
│   └── app.db              ← SQLite Datenbank (wird automatisch erstellt)
├── templates/
│   └── index.html          ← HTML Grundgerüst
└── static/
    ├── css/
    │   └── style.css       ← Styles (Farbpalette: a2d2ff, bde0fe, ffafcc)
    └── js/
        └── app.js          ← Frontend-Logik (Todos, Kalender, Drag & Drop)
```

## Voraussetzungen

- Python 3.8 oder neuer
- pip

## Installation & Start

### Windows
Doppelklick auf `start.bat` – oder im Terminal:
```
cd todo_calendar_app
pip install -r requirements.txt
python app.py
```

### Mac / Linux
```bash
cd todo_calendar_app
chmod +x start.sh
./start.sh
```

Danach im Browser öffnen: **http://localhost:5000**

## Features

### Aufgaben-Reiter
- Aufgaben erstellen, bearbeiten, löschen
- Priorität 1–5 (5 = höchste Priorität)
- Zeitliche Dauer (z.B. 2.5h)
- Deadline mit Überfälligkeitsanzeige
- Aufgaben als erledigt markieren
- Filter nach Priorität / Status

### Kalender-Reiter
- **Wochenansicht** mit Stunden-Slots (0–23 Uhr)
- **Monatsansicht** mit Tages-Übersicht
- **Drag & Drop**: Aufgaben aus der Aufgaben-Leiste in den Kalender ziehen
- **Manuelle Eingabe**: Datum und Uhrzeit direkt eingeben
- Bei Konflikt (selbe Aufgabe, selber Tag): Nutzer wird gefragt
- Vergangene Kalendereinträge werden automatisch bereinigt (Aufgaben bleiben erhalten)

## Datenspeicherung
- Alle Daten werden in `data/app.db` (SQLite) gespeichert
- Kalendereinträge aus der Vergangenheit werden automatisch gelöscht
- Die Aufgaben selbst bleiben dauerhaft erhalten (bis manuell gelöscht)
