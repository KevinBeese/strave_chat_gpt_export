# Strava GPT Export

MVP, um Strava-Aktivitaeten per sessionbasiertem User-Flow zu laden und in ein ChatGPT-taugliches Format zu exportieren.

## Stack

- Next.js
- TypeScript
- Prisma
- PostgreSQL
- zod
- Tailwind CSS

## MVP-Funktionen

- Strava OAuth Login
- Sessionbasierter User-Flow (pro Browser-Session)
- Speicherung von Token pro User in PostgreSQL
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
- Optional fuer robustere API-Aufrufe:
  - `STRAVA_RETRY_MAX_ATTEMPTS` (Default `4`)
  - `STRAVA_RETRY_BASE_DELAY_MS` (Default `500`)
- `DATABASE_URL` auf eine PostgreSQL-Instanz setzen (lokal z. B. `postgresql://postgres:postgres@localhost:5432/strava_export?schema=public`)
- Als Authorization Callback Domain in Strava fuer den lokalen Test: `localhost`
- Als Callback URL in Strava: `http://localhost:3000/api/strava/callback`

4. Prisma Client generieren:

```bash
npm run prisma:setup
```

5. Dev-Server starten:

```bash
npm run dev
```

Danach ist die App unter `http://localhost:3000` erreichbar.

## Go-Live (Docker + PostgreSQL)

Dieses Repo ist jetzt fuer Docker vorbereitet und kann auf Plattformen wie Render, Railway, Fly.io oder Coolify deployed werden.

### 1. Build/Start Kommandos

- Build: `docker build -t strava-gpt-export .`
- Run lokal:

```bash
docker run --rm -p 3000:3000 \
  -e APP_URL="http://localhost:3000" \
  -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require" \
  -e SESSION_SECRET="replace-with-long-random-secret" \
  -e STRAVA_CLIENT_ID="your-client-id" \
  -e STRAVA_CLIENT_SECRET="your-client-secret" \
  -e STRAVA_REDIRECT_URI="http://localhost:3000/api/strava/callback" \
  strava-gpt-export
```

### 2. Wichtige Produktions-ENV Variablen

- `APP_URL`: z. B. `https://strava-export.deinedomain.de`
- `DATABASE_URL`: PostgreSQL Connection String, z. B. `postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require`
- `SESSION_SECRET`: langes zufaelliges Secret (mind. 12 Zeichen)
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`: `https://<deine-domain>/api/strava/callback`

### 3. Strava App richtig konfigurieren

In deiner Strava Application muessen fuer Produktion gesetzt sein:

- **Authorization Callback Domain**: deine Live-Domain (ohne Protokoll)
- **Callback URL**: `https://<deine-domain>/api/strava/callback`

Wenn Domain/Callback nicht exakt passen, funktioniert OAuth nicht.

### 4. Datenbank-Schema sicherstellen

Beim ersten Start muss das Prisma-Schema in PostgreSQL angelegt werden.

- Setze `DATABASE_URL` auf deine Postgres-Instanz
- Der Startbefehl fuehrt automatisch `prisma db push` aus

### 5. Empfehlung fuer Betrieb

Fuer Vercel oder andere serverlose Umgebungen nutze eine verwaltete Postgres-DB (z. B. Vercel Postgres, Neon, Supabase).

## Supabase Setup (Vercel)

Wenn du Supabase statt Vercel Postgres nutzt, funktioniert der Strava-Login genauso.

1. Erstelle in Supabase ein Projekt und oeffne **Project Settings > Database**.
2. Kopiere den Postgres-Connection-String (Transaktions- oder Session-Pooler mit SSL).
3. Setze in Vercel unter **Settings > Environment Variables**:
   - `DATABASE_URL=<dein-supabase-postgres-string>`
   - `APP_URL=https://<deine-vercel-domain>`
   - `STRAVA_REDIRECT_URI=https://<deine-vercel-domain>/api/strava/callback`
   - `SESSION_SECRET=<langes-zufaelliges-secret>`
4. Lege das Prisma-Schema einmalig an:

```bash
DATABASE_URL="<dein-supabase-postgres-string>" npx prisma db push
```

5. Redeploy auf Vercel und teste OAuth neu.

Hinweis: Wenn `P2021` oder `db_schema_missing` erscheint, wurde Schritt 4 noch nicht erfolgreich ausgefuehrt.

## Lokaler OAuth-Test

1. `cp .env.example .env.local`
2. Trage deine echte Strava `Client ID` und dein `Client Secret` ein
3. Lasse `APP_URL` auf `http://localhost:3000`
4. Lasse `STRAVA_REDIRECT_URI` auf `http://localhost:3000/api/strava/callback`
5. Starte `npm run prisma:setup`
6. Starte `npm run dev`
7. Oeffne `http://localhost:3000/dashboard`
8. Klicke auf `Mit Strava verbinden`

## Naechste Schritte

- optionaler Login-Provider (z. B. Auth.js) fuer persistente Accounts
- Export als Datei-Download ergaenzen
- gespeicherte Exporte historisieren
- spaeter Streams und weitere Metriken anbinden
