# Strava GPT Export

Lokales MVP, um Strava-Aktivitaeten der letzten 7 Tage zu laden und in ein ChatGPT-taugliches Format zu exportieren.

## Stack

- Next.js
- TypeScript
- Prisma
- SQLite
- zod
- Tailwind CSS

## MVP-Funktionen

- Strava OAuth Login
- Lokale Speicherung von Token in SQLite
- Export der letzten 7 Tage
- Ausgabe als JSON
- Ausgabe als ChatGPT-Ready Text

## Setup

1. Abhaengigkeiten installieren:

```bash
npm install
```

2. Umgebungsvariablen anlegen:

```bash
cp .env.example .env.local
```

3. In Strava eine Application anlegen und diese Werte eintragen:
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`
- `DATABASE_URL` kann auf `file:./prisma/dev.db` bleiben

4. Prisma Client generieren:

```bash
npm run prisma:setup
```

5. Dev-Server starten:

```bash
npm run dev
```

Danach ist die App unter `http://localhost:3000` erreichbar.

## Naechste Schritte

- echten Session-Flow fuer mehrere Nutzer aufbauen
- Export als Datei-Download ergaenzen
- gespeicherte Exporte historisieren
- spaeter Streams und weitere Metriken anbinden
