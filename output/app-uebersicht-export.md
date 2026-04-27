# Strava Export App - Gesamtuebersicht (All-in-One Export)

## 1) Inhalt, Ziel und Grundlogik

Die Anwendung ist ein persoenliches Trainings-Dashboard mit Fokus auf **ChatGPT-tauglichen Export**.

### Ziel
- Aktivitaeten je User aus Strava/Wahoo laden
- Daten vereinheitlichen und deduplizieren
- Analysefaehige Exporte erzeugen (JSON + GPT-Prompt)
- Wochenzusammenfassung und Verlauf (Snapshots/Trends) bereitstellen

### Grundlogik (kurz)
1. User loggt sich ein (Supabase Auth).
2. User verbindet Strava und/oder Wahoo via OAuth.
3. Sync holt Aktivitaeten vom Provider und speichert sie in PostgreSQL (Prisma).
4. App dedupliziert provideruebergreifende Duplikate.
5. Export baut JSON + ChatGPT-Prompt + Snapshot-Vergleich.
6. Dashboard/Activities/Weekly Summary visualisieren Kennzahlen, Details und Trends.

---

## 2) Userflows

1. Onboarding: Login -> Provider verbinden -> ersten 7-Tage-Export erstellen.
2. Connect-Flow: OAuth starten -> Callback -> Token sicher speichern.
3. Sync-Flow: manuell syncen -> inkrementell neue Aktivitäten laden -> upsert.
4. Export-Flow: Zeitraum/Filter wählen -> Export generieren -> copy/download.
5. Analyse-Flow: Snapshot-Deltas und Trends (Load, Intensity, Duration) ansehen.
6. Activities-Flow: filtern/suchen -> deduplizierte Liste -> Detailansicht.
7. Weekly-Flow: Wochenkennzahlen + Vergleich zur Vorwoche + Markdown-Download.
8. Settings/Admin-Flow: Profil, Rollen-Code, Invite-Codes, Account-Loeschung.

---

## 3) Unterfunktionen und Sinn

- `src/lib/auth.ts`: Auth-Guards, User-Kontext, Profil-Initialisierung.
- `src/lib/strava.ts`: Strava OAuth, Refresh, Sync, Export- und Snapshot-Logik.
- `src/lib/wahoo.ts`: Wahoo OAuth, Refresh, Workout-Sync.
- `src/lib/token-crypto.ts`: sichere Token-Verschluesselung.
- `src/lib/activity-dedupe.ts`: Dubletten zwischen Providern zusammenfuehren.
- `src/lib/dashboard.ts`: KPIs fuer Dashboard (7/30 Tage, Sportarten, Recents).
- `src/lib/export-filters.ts`: Filter-Parsing + Filteranwendung.
- `src/lib/export-format.ts`: JSON + ChatGPT-Ready Prompt erzeugen.
- `src/lib/weekly-summary.ts`: Wochenmetriken, Highlights, Delta zur Vorwoche.
- `src/lib/admin-codes.ts`: Rollen-/Invite-Code-Logik.
- `src/lib/route-errors.ts`: einheitliche Fehlerobjekte und API-Responses.

---

## 4) Architekturdiagramm (Flow)

```mermaid
flowchart TD
    U["User"] --> A["Auth (Supabase)"]
    A --> D["Dashboard"]

    D --> S1["Connect Strava"]
    D --> W1["Connect Wahoo"]
    S1 --> S2["OAuth Callback + Token speichern"]
    W1 --> W2["OAuth Callback + Token speichern"]

    D --> SY["Sync (Strava/Wahoo)"]
    SY --> API["Provider APIs"]
    API --> DB["PostgreSQL (Prisma)"]

    DB --> DD["Dedupe ueber Provider"]
    DD --> ACT["Activities Liste + Detail"]

    D --> EX["Export (7/14/30 + Filter)"]
    EX --> SNAP["Snapshot + Trendvergleich"]
    SNAP --> OUT["JSON + GPT Prompt"]

    D --> WS["Weekly Summary"]
    WS --> MD["Markdown Export"]

    D --> SET["Settings/Admin"]
    SET --> ROLE["Rollen-Codes & Invite-Codes"]
```

---

## 5) Datenmodell (ER)

```mermaid
erDiagram
    Profile ||--o| StravaConnection : has
    Profile ||--o| WahooConnection : has
    Profile ||--o{ Activity : owns
    Profile ||--o{ ExportSnapshot : owns
    Profile ||--o{ AdminInviteCode : creates_or_uses

    Profile {
      uuid id
      string email
      string displayName
      enum role
    }

    StravaConnection {
      uuid userId
      string athleteId
      string accessToken_encrypted
      string refreshToken_encrypted
      datetime expiresAt
    }

    WahooConnection {
      uuid userId
      string wahooUserId
      string accessToken_encrypted
      string refreshToken_encrypted
      datetime expiresAt
    }

    Activity {
      bigint id
      uuid userId
      string provider
      string providerActivityId
      datetime startDate
      float distanceMeters
      int movingTimeSeconds
      json rawJson
      string providerMetricsJson
      string zonesJson
    }

    ExportSnapshot {
      string id
      uuid userId
      datetime rangeStart
      datetime rangeEnd
      string activityJson
      datetime createdAt
    }

    AdminInviteCode {
      string id
      string codeHash
      enum targetRole
      int maxUses
      int usedCount
      datetime expiresAt
      datetime revokedAt
    }
```

---

## 6) Request -> Route -> Lib -> DB Mapping

| Use Case | Route | Lib-Funktionen | DB-Operation |
|---|---|---|---|
| Login | `src/app/auth/sign-in/route.ts` | `createSupabaseServerClient().auth.signInWithPassword(...)` | keine direkte Prisma-Aenderung |
| Signup | `src/app/auth/sign-up/route.ts` | `signUp(...)`, `ensureAppUserExists(...)` | `profile.upsert` |
| Logout | `src/app/auth/sign-out/route.ts` | `disconnectStravaConnectionWithDeauthorize`, `disconnectWahooConnectionWithDeauthorize` | `stravaConnection.deleteMany`, `wahooConnection.deleteMany` |
| Strava OAuth Start | `src/app/api/strava/auth/route.ts` | `getAuthenticatedAppUserId`, `getEnv` | keine |
| Strava OAuth Callback | `src/app/api/strava/callback/route.ts` | `exchangeCodeForToken`, `upsertStravaConnection` | `stravaConnection.upsert` |
| Wahoo OAuth Start | `src/app/api/wahoo/auth/route.ts` | `getAuthenticatedAppUserId`, `canStartWahooOauth` | keine |
| Wahoo OAuth Callback | `src/app/api/auth/wahoo/callback/route.ts` | `exchangeCodeForWahooToken`, `fetchAuthenticatedWahooUser`, `upsertWahooConnection` | `wahooConnection.upsert` |
| Strava Sync | `src/app/api/strava/sync/route.ts` | `syncActivitiesForUser` | `activity.findFirst/count`, `activity.upsert` |
| Wahoo Sync | `src/app/api/wahoo/sync/route.ts` | `syncWahooWorkoutsForUser` | `activity.findFirst/count`, `activity.upsert` |
| Strava Export | `src/app/api/strava/export/route.ts` | `parseExportFilters`, `resolveDaysForDateRange`, `syncAndLoadActivities`/`loadStoredActivitiesForExport`, `filterActivitiesForExport`, `buildAndStoreExportPayload` | `activity.findMany/upsert`, `exportSnapshot.findMany/create` |
| Activities API | `src/app/api/activities/route.ts` | `dedupeActivitiesAcrossProviders` | `activity.findMany` |
| Weekly Summary API | `src/app/api/summary/weekly/route.ts` | `getWeeklySummary` | `activity.findMany` |
| Weekly Markdown Export | `src/app/api/export/weekly.md/route.ts` | `getWeeklySummary`, `renderWeeklySummaryMarkdown` | `activity.findMany` |
| Profil speichern | `src/app/settings/profile/route.ts` | `requireAppUserId` | `profile.update` |
| Rollen-Code einloesen | `src/app/settings/redeem-role-code/route.ts` | `hashAdminCode`, `matchesBootstrapSuperadminCode` | `profile.findUnique/update`, `adminInviteCode.findUnique/updateMany` |
| Invite-Code erstellen | `src/app/api/admin/invite-codes/create/route.ts` | `getAuthenticatedAppProfile`, `generateAdminInviteCodeValue`, `hashAdminCode` | `adminInviteCode.create` |
| Konto loeschen | `src/app/api/account/delete/route.ts` | `getAuthenticatedAppProfile`, Disconnect-Funktionen | `profile.delete` (+ Cascade) |

---

## 7) Sequence 1 - Connect (OAuth)

```mermaid
sequenceDiagram
    actor U as User
    participant UI as Dashboard UI
    participant R as /api/{provider}/auth
    participant P as Strava/Wahoo OAuth
    participant C as Callback Route
    participant L as lib/strava.ts or lib/wahoo.ts
    participant DB as PostgreSQL (Prisma)

    U->>UI: Klick "Mit Provider verbinden"
    UI->>R: GET /api/{provider}/connect -> /auth
    R-->>U: Redirect zu OAuth + state cookie
    U->>P: Consent/Login beim Provider
    P-->>C: Redirect mit code + state
    C->>C: state validieren
    C->>L: exchangeCodeForToken(...)
    L->>L: optional user profile laden
    L->>DB: upsert {provider}Connection (encrypted tokens)
    C-->>UI: Redirect /dashboard?connected=1
```

## 8) Sequence 2 - Sync

```mermaid
sequenceDiagram
    actor U as User
    participant UI as SyncButton
    participant API as /api/{provider}/sync
    participant L as syncActivitiesForUser / syncWahooWorkoutsForUser
    participant P as Provider API
    participant DB as PostgreSQL (Prisma)

    U->>UI: Klick "Synchronisieren"
    UI->>API: POST /api/{provider}/sync
    API->>L: starte Sync
    L->>DB: letzte gespeicherte Aktivitaet lesen
    L->>P: inkrementelle Aktivitaeten/Workouts holen
    L->>L: normalisieren + Metriken aufbereiten
    L->>DB: activity.upsert pro Eintrag
    L->>DB: count totalInDb
    L-->>API: Ergebnis-JSON
    API-->>UI: Erfolg
    UI->>UI: router.refresh()
```

## 9) Sequence 3 - Export

```mermaid
sequenceDiagram
    actor U as User
    participant UI as ExportPanel
    participant API as /api/strava/export
    participant F as export-filters.ts
    participant L as strava.ts
    participant E as export-format.ts
    participant DB as PostgreSQL (Prisma)

    U->>UI: Zeitraum/Filter waehlen + Export starten
    UI->>API: GET /api/strava/export?days=...&filters...
    API->>F: parseExportFilters + resolveDaysForDateRange
    alt source=sync
        API->>L: syncAndLoadActivities(...)
        L->>DB: activity.upsert/findMany
    else source=local
        API->>L: loadStoredActivitiesForExport(...)
        L->>DB: activity.findMany
    end
    API->>F: filterActivitiesForExport(...)
    API->>L: buildAndStoreExportPayload(...)
    L->>DB: exportSnapshot.findMany (Historie)
    L->>L: Compare/Trend berechnen
    L->>E: createExportPayload (JSON + chatGptPrompt)
    L->>DB: exportSnapshot.create
    API-->>UI: ExportPayload
```

## 10) Sequence 4 - Weekly Summary

```mermaid
sequenceDiagram
    actor U as User
    participant UI as Dashboard / Download Link
    participant API as /api/summary/weekly
    participant MD as /api/export/weekly.md
    participant W as weekly-summary.ts
    participant D as activity-dedupe.ts
    participant DB as PostgreSQL (Prisma)

    U->>UI: Wochenuebersicht ansehen
    UI->>API: GET /api/summary/weekly?weekStart=...
    API->>W: getWeeklySummary(userId, weekStart)
    W->>DB: activity.findMany (2 Wochen Fenster)
    W->>D: dedupeActivitiesAcrossProviders(...)
    W->>W: Metrics + Highlights + Vorwochen-Delta
    API-->>UI: WeeklySummaryResponse

    U->>UI: "Markdown exportieren"
    UI->>MD: GET /api/export/weekly.md?weekStart=...
    MD->>W: getWeeklySummary(...) + renderWeeklySummaryMarkdown(...)
    MD-->>U: Datei-Download weekly-summary-YYYY-MM-DD.md
```

