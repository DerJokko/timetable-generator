# Timetable Generator

Interaktiver Stundenplan für das Physik-Wintersemester 2026/27. Veranstaltungen lassen sich auswählen, um mögliche Kurskombinationen zu planen.
Ausprobieren: [https://www.derjokko.github.io/timetable-generator/](https://derjokko.github.io/timetable-generator/)

## Verwendung

Die Terminliste liegt in `events.json`. Für lokale Nutzung die Dateien über einen lokalen Webserver öffnen, damit der Browser die JSON-Datei laden kann, zum Beispiel im Projektordner:

```powershell
python -m http.server 8000
```

Anschließend `http://localhost:8000` im Browser öffnen.

- Jeder Termin in `events.json` verwendet die Felder `Name`, `Art`, `Gruppe`, `Anmerkung`, `Tag`, `StundeVon` und `StundeBis`. `Gruppe` ist immer eine Liste; mehrere Einträge sind auswählbare Gruppen.
- Die Tagesnummern sind Montag=1 bis Freitag=5. Die Stunden sind 45-Minuten-Zeitslots mit 10 Minuten Pause dazwischen: Slot 1 beginnt um 08:00, Slot 2 um 08:55, Slot 3 um 09:50 und Slot 12 endet um 18:50. Bereiche sind einschließlich, also steht `1–2` für 08:00–09:40 und `3–3` für 09:50–10:35.
- Veranstaltungsblöcke zeigen Name, Art, Gruppe und optionale Anmerkungen in dieser Reihenfolge. Bei UE-Angeboten mit mehreren Gruppen (z. B. `4/6/8`) die gewünschte Gruppe direkt anklicken.
- Bei gleichzeitig stattfindenden Terminen ist die Anordnung von links nach rechts: VL, Tutorium, UE.
- Bei zeitlichen Überschneidungen kannst Du nach einer Warnung im Bestätigungsdialog entscheiden, ob Du die Auswahl trotzdem übernehmen möchtest.
- Mit **Alle VL auswählen** alle Vorlesungsangebote modulübergreifend markieren.
- Mit **PNG exportieren** den Stundenplan herunterladen.

## Dateien

- `index.html` – Seitenstruktur und Stundenplan
- `events.json` – einheitliche Terminliste einschließlich Tag- und Zeitslotnummern
- `styles.css` – Darstellung
- `script.js` – Auswahl und PNG-Export
- `favicon.ico` – Seitensymbol