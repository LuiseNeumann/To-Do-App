# Anforderungsanalyse – Planer App (Todo & Kalender)

**Projektname:** Planer App  
**Technologie-Stack:** Python (Flask) · SQLite → PostgreSQL · JavaScript · CSS  
**Hosting:** Railway (Cloud, kostenlos)  
**Stand:** Mai 2026  

---

## 1. Projektüberblick

Die Planer App ist eine persönliche Produktivitäts- und Planungsanwendung, die als Progressive Web App (PWA) im Browser läuft und auf Desktop sowie Mobilgeräten installierbar ist. Sie ermöglicht das Verwalten von Aufgaben (Todos), die Einplanung dieser in einen gemeinsamen Kalender sowie eine strategische Priorisierung mittels der Eisenhower-Matrix.

---

## 2. Stakeholder

| Stakeholder | Rolle | Beschreibung |
|---|---|---|
| Primärnutzerin | Hauptanwender | Erstellt, verwaltet und plant Todos und Kalendereinträge |
| PartnerIn/Familie/FreundInnen | Sekundärnutzer | Sieht und bearbeitet den gemeinsamen Kalender über geteilten Link |

---

## 3. Funktionale Anforderungen

### 3.1 Todo-Verwaltung (Reiter: Aufgaben)

| ID | Anforderung | Status |
|---|---|---|
| F-01 | Todos erstellen mit Titel und Beschreibung | 
| F-02 | Priorität vergeben (Skala 1–5, 5 = höchste Priorität) 
| F-03 | Zeitliche Dauer hinterlegen (z.B. 2h) 
| F-04 | Deadline setzen mit Überfälligkeitsanzeige 
| F-05 | Todos als erledigt markieren 
| F-06 | Todos bearbeiten und löschen
| F-07 | Filter nach Priorität, Status (offen/erledigt)
| F-08 | Direkt beim Todo einen Kalendertermin hinterlegen (Datum + Von/Bis) 
| F-09 | Todos dauerhaft speichern (PostgreSQL) 
| F-10 | Todos ohne Datum in den Kalender schiebbar (Drag & Drop) 

### 3.2 Kalender (Reiter: Kalender)

| ID | Anforderung | Status |
|---|---|---|
| K-01 | Wochenansicht mit Stundenraster (00–23 Uhr) 
| K-02 | Monatsansicht 
| K-03 | Navigation zwischen Wochen und Monaten 
| K-04 | Todos per Drag & Drop in Zeitslots einplanen 
| K-05 | Per Klick auf Zeitslot Termin hinzufügen 
| K-06 | Kalendereinträge manuell mit Datum und Uhrzeit anlegen 
| K-07 | Wiederholung: Einmalig / Täglich / Wöchentlich / Jährlich 
| K-08 | Vergangene einmalige Einträge automatisch bereinigen 
| K-09 | Wiederkehrende Einträge bleiben dauerhaft erhalten 
| K-10 | Bei Konflikt (selbe Aufgabe, selber Tag) Nutzer fragen 
| K-11 | Freie Termine ohne Todo-Verknüpfung anlegen (z.B. Stundenplan) 
| K-12 | Kalendereinträge dauerhaft speichern (PostgreSQL) 
| K-13 | Horizontales Scrollen in der Wochenansicht auf Mobilgeräten 

### 3.3 Partner-Kalender (Reiter: Partner)

| ID | Anforderung | Status |
|---|---|---|
| P-01 | Eigener Kalender pro Profil (me / partner) 
| P-02 | Zwei feste Profile ohne Login (einfach umschalten) 
| P-03 | Kalender per Link teilen (kein Login erforderlich) 
| P-04 | Partner kann Einträge sehen und hinzufügen 
| P-05 | Zurückwechseln zum eigenen Kalender jederzeit möglich 
| P-06 | ICS-Export für Apple/Google Kalender Sync 

### 3.4 Eisenhower-Matrix (Reiter: Eisenhower)

| ID | Anforderung | Status |
|---|---|---|
| E-01 | 2×2 Matrix mit vier Quadranten 
| E-02 | Quadrant 1: Wichtig & Dringend – „Sofort erledigen" 
| E-03 | Quadrant 2: Wichtig & Nicht dringend – „Einplanen" 
| E-04 | Quadrant 3: Unwichtig & Dringend – „Delegieren" 
| E-05 | Quadrant 4: Unwichtig & Nicht dringend – „Eliminieren" 
| E-06 | Todos per Drag & Drop in Quadranten ziehen 
| E-07 | Zuordnung lokal gespeichert (localStorage) 
| E-08 | Todos aus Quadrant zurück in Tray verschieben 

### 3.5 Design & Benutzeroberfläche

| ID | Anforderung | Status |
|---|---|---|
| D-01 | Farbpalette: `#a2d2ff`, `#bde0fe`, `#ffafcc` 
| D-02 | Sidebar-Navigation mit aufklappbaren Reitern 
| D-03 | Logo flexibel austauschbar (PNG/JPG Upload) 
| D-04 | Responsive Design für Mobilgeräte 
| D-05 | Mobile Navigation als horizontale Tab-Leiste 
| D-06 | Toast-Benachrichtigungen bei Aktionen 

### 3.6 Technische Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| T-01 | Python Flask Backend 
| T-02 | PostgreSQL Datenbank (dauerhaft, Cloud) 
| T-03 | Hosting auf Railway (kostenlos) 
| T-04 | PWA (installierbar auf Desktop & Handy) 
| T-05 | Service Worker für Offline-Fähigkeit 
| T-06 | Öffentliche URL erreichbar ohne VPN 
| T-07 | Gunicorn als Production-Server 

---

## 4. Nicht-funktionale Anforderungen

| ID | Anforderung | Beschreibung |
|---|---|---|
| NF-01 | Verfügbarkeit | App läuft auch wenn der eigene PC ausgeschaltet ist (Cloud-Hosting) |
| NF-02 | Datenpersistenz | Alle Todos und Kalendereinträge bleiben dauerhaft erhalten |
| NF-03 | Benutzerfreundlichkeit | Intuitive Bedienung ohne Einarbeitungszeit |
| NF-04 | Performance | Ladezeit unter 2 Sekunden auf normalem Internetanschluss |
| NF-05 | Sicherheit | Geteilte Links sind tokenbasiert (24-Byte URL-safe Token) |
| NF-06 | Skalierbarkeit | Single-User App, kein Multi-Tenant erforderlich |

---

## 5. Abgrenzung (Out of Scope)

Die folgenden Funktionen sind momentan **nicht** Teil des aktuellen Projekts:

- Benachrichtigungen / Push-Notifications bei Deadlines
- E-Mail-Versand oder Kalender-Einladungen
- Mehrbenutzer-Login mit Passwort-Authentifizierung
- Mobile App im App Store (nur PWA)
- Mehrsprachigkeit (nur Deutsch)
- Zeiterfassung / Pomodoro-Timer

---

## 6. Datenmodell

### Tabelle: `todos`
| Feld | Typ | Beschreibung |
|---|---|---|
| id | SERIAL | Primärschlüssel |
| title | TEXT | Titel der Aufgabe |
| description | TEXT | Optionale Beschreibung |
| priority | INTEGER | 1–5 (5 = höchste Priorität) |
| duration_hours | REAL | Geschätzte Dauer in Stunden |
| deadline | TEXT | Fälligkeitsdatum (ISO-Format) |
| completed | INTEGER | 0 = offen, 1 = erledigt |
| created_at | TEXT | Erstellungszeitpunkt |

### Tabelle: `calendar_entries`
| Feld | Typ | Beschreibung |
|---|---|---|
| id | SERIAL | Primärschlüssel |
| todo_id | INTEGER | Optionale Verknüpfung zu Todo (NULL = freier Termin) |
| entry_date | TEXT | Datum des Eintrags (ISO-Format) |
| start_time | TEXT | Startzeit (HH:MM) |
| end_time | TEXT | Endzeit (HH:MM) |
| title | TEXT | Titel (bei freien Terminen ohne Todo) |
| recurrence | TEXT | `once` / `daily` / `weekly` / `yearly` |
| profile | TEXT | `me` oder `partner` |

### Tabelle: `share_links`
| Feld | Typ | Beschreibung |
|---|---|---|
| id | SERIAL | Primärschlüssel |
| token | TEXT | Eindeutiger URL-Token |
| can_edit | INTEGER | 0 = readonly, 1 = bearbeitbar |
| created_at | TEXT | Erstellungszeitpunkt |

### Tabelle: `settings`
| Feld | Typ | Beschreibung |
|---|---|---|
| key | TEXT | Einstellungsschlüssel (z.B. `logo`) |
| value | TEXT | Einstellungswert |

---

## 7. Bekannte Einschränkungen & offene Punkte

| # | Beschreibung | Priorität |
|---|---|---|
| 1 | Eisenhower-Zuordnungen nur im localStorage – bei neuem Gerät/Browser verloren | Mittel |
| 2 | Kein Passwortschutz – wer die URL kennt, hat Zugriff | Niedrig (Privatnutzung) |
| 3 | Logo-Upload nicht persistent bei Railway-Neustart (statische Dateien) | Mittel |
| 4 | Keine Push-Benachrichtigungen bei nahenden Deadlines | Niedrig |
| 5 | ICS-Export enthält keine Wiederholungsregeln (RRULE) | Niedrig |

---












Ich möchte eine Kalender udn Todo App entwickeln mit phyton als backend und javascript und css als frontback. Es soll ein Interface erstellt werden mit verschiedenen reitern: 1.Reiter: To do - hier soll man flexibel todos hinzufügen und löschen, die gelöschten müssen nicht mehr gespeichert werden, die erstellten schon. ebenfalls soll man felxibel die Gewichtung hinzufügen können und die zeitliche Dauer und die Deadline also zb ToDo1 hat eine Gewichtung von 5 (5= höchste Priorität, 1 niedrigste Priorität), dauert 2h um es zu erledigen und muss am 01.03. fertig sein. Diese Daten möchte ich flexibel ergänzen in dem To do. Der 2. reiter sollte der Kalender sein. Hier soll es eine Wochenansicht geben und Monatsansicht, wo man die ToDos ergänzen kann, so dass man zb Todo1 auf Montag schieben kann und es ist im Kalender hinterlegt, beispielsweise für den Zeitraum 18-20 Uhr. Dies soll auch gespeichert werden, aber sobald der Tag vorbei ist, muss es nicht mehr gespeichert sein, das ToDo soll aber nicht gelöscht werden nur der Kalendereintrag. Farbpalette für das Design: a2d2ff,bde0fe,ffafcc Generiere mir dazu den Code mit entsprechender Ordnerstruktur.
