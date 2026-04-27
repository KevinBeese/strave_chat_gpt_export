# Strava GPT Export

MVP, um Strava-Aktivitaeten pro Supabase-Account zu laden und in ein ChatGPT-taugliches Format zu exportieren.

## Stack

- Next.js
- TypeScript
- Supabase Auth
- Prisma
- PostgreSQL
- zod
- Tailwind CSS

## MVP-Funktionen

- E-Mail/Passwort Login ueber Supabase Auth
- Strava OAuth nur fuer eingeloggte Accounts
- Speicherung von Token pro User in PostgreSQL
- Export der letzten 7 Tage
- Ausgabe als JSON
- Ausgabe als ChatGPT-Ready Text

## Umgebungen (nur Dev + Prod)

- `dev`: eigene URL, eigene Supabase-Instanz, eigene PostgreSQL-DB
- `prod`: eigene URL, eigene Supabase-Instanz, eigene PostgreSQL-DB
- `stage`: bewusst nicht vorgesehen

Die Flavor-Steuerung laeuft ueber:
- `APP_ENV=dev|prod` (serverseitig)
- `NEXT_PUBLIC_APP_ENV=dev|prod` (clientseitig, UI/Browser-Titel)

## Lokales Setup (ohne Deploy)

1. Dependencies installieren:

```bash
npm install
```

2. Lokale Dev/Prod-Env-Dateien anlegen:

```bash
cp .env.development.local.example .env.development.local
cp .env.production.local.example .env.production.local
```

3. Lokale Datenbanken starten (zwei getrennte Postgres-Container):

```bash
npm run db:up
```

4. Prisma-Schema fuer beide Umgebungen initialisieren:

```bash
npm run prisma:setup:dev
npm run prisma:setup:prod
```

5. Lokal im Dev-Flavor starten (Hot Reload):

```bash
npm run dev:local
```

Danach ist die App unter `http://localhost:3000` erreichbar.

6. Produktionsnah lokal testen (Build + Start, kein Hot Reload):

```bash
npm run preview:prod:local
```

Danach laeuft die lokale Prod-Vorschau standardmaessig auf Port `3001`
(konfigurierbar in `.env.production.local` ueber `PORT`).

## Supabase + OAuth pro Umgebung

### Dev
- eigene Supabase-Instanz/Projekt (empfohlen)
- eigene Domain, z. B. `https://dev.<deine-domain>`
- Strava Callback: `https://dev.<deine-domain>/api/strava/callback`
- Wahoo Callback: `https://dev.<deine-domain>/api/auth/wahoo/callback`

### Prod
- getrennte Supabase-Instanz/Projekt
- Live-Domain
- Strava Callback: `https://<deine-domain>/api/strava/callback`
- Wahoo Callback: `https://<deine-domain>/api/auth/wahoo/callback`

Wichtig: Dev und Prod nicht gegen dieselbe Datenbank oder dieselben OAuth-Redirects laufen lassen.

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

- `APP_ENV=prod`
- `NEXT_PUBLIC_APP_ENV=prod`
- `APP_URL`: z. B. `https://strava-export.deinedomain.de`
- `DATABASE_URL`: PostgreSQL Connection String, z. B. `postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require`
- `SESSION_SECRET`: langes zufaelliges Secret (mind. 12 Zeichen)
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`: `https://<deine-domain>/api/strava/callback`
- Optional:
  - `SUPERADMIN_BOOTSTRAP_CODE`
  - `ADMIN_CODE_HASH_PEPPER`
- Optional:
  - `WAHOO_CLIENT_ID`
  - `WAHOO_CLIENT_SECRET`
  - `WAHOO_REDIRECT_URI`: `https://<deine-domain>/api/auth/wahoo/callback`
  - `WAHOO_OAUTH_SCOPES`: z. B. `user_read workouts_read`

Hinweis zu Wahoo OAuth Scopes:
- Wenn Wahoo beim Login `invalid_scope` oder `Der angeforderte Bereich ist ungueltig` meldet,
  setze `WAHOO_OAUTH_SCOPES` auf die in deinem Wahoo Developer Portal freigegebenen Scopes.
- Fuer den Sync wird mindestens `user_read workouts_read` benoetigt.

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

Supabase wird hier fuer zwei Dinge genutzt: Auth (Login) und optional PostgreSQL.

1. Erstelle in Supabase ein Projekt.
2. Unter **Authentication > URL Configuration** deine App-URL eintragen (z. B. `https://<deine-vercel-domain>`).
3. Unter **Project Settings > API** kopieren:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Optional unter **Project Settings > Database** den Postgres-Connection-String kopieren.
5. Setze in Vercel unter **Settings > Environment Variables**:
   - `APP_ENV=prod`
   - `NEXT_PUBLIC_APP_ENV=prod`
   - `NEXT_PUBLIC_SUPABASE_URL=<deine-supabase-url>`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<dein-anon-key>`
   - `DATABASE_URL=<dein-supabase-postgres-string>`
   - `APP_URL=https://<deine-vercel-domain>`
   - `STRAVA_REDIRECT_URI=https://<deine-vercel-domain>/api/strava/callback`
   - `SESSION_SECRET=<langes-zufaelliges-secret>`
6. Lege das Prisma-Schema einmalig an:

```bash
DATABASE_URL="<dein-supabase-postgres-string>" npx prisma db push
```

7. Redeploy auf Vercel und teste zuerst Login (`/auth`), danach Strava OAuth.

Hinweis: Wenn `P2021` oder `db_schema_missing` erscheint, wurde Schritt 6 noch nicht erfolgreich ausgefuehrt.

## Lokaler Auth + OAuth-Test

1. `cp .env.development.local.example .env.development.local`
2. Trage echte Strava-/Supabase-Dev-Werte ein
3. `npm run db:up`
4. `npm run prisma:setup:dev`
5. `npm run dev:local`
6. Oeffne `http://localhost:3000/auth`, dann `/dashboard`
7. Klicke auf `Mit Strava verbinden`

## Naechste Schritte

- Export als Datei-Download ergaenzen
- gespeicherte Exporte historisieren
- spaeter Streams und weitere Metriken anbinden
