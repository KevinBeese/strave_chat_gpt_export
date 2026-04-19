# Projektarchitektur: Strava Export

## 1) End-to-End Flow

```mermaid
flowchart TD
    U["User (Browser)"] --> A["/auth (Supabase Login/Signup)"]
    A --> B["/dashboard"]

    B --> C["Strava Connect (/api/strava/connect -> /api/strava/auth)"]
    C --> D["Strava OAuth Consent"]
    D --> E["/api/strava/callback"]
    E --> F["StravaConnection upsert (encrypted tokens)"]

    B --> C2["Wahoo Connect (/api/wahoo/connect -> /api/wahoo/auth)"]
    C2 --> D2["Wahoo OAuth Consent"]
    D2 --> E2["/api/auth/wahoo/callback -> /api/wahoo/callback"]
    E2 --> F2["WahooConnection upsert (encrypted tokens)"]

    B --> G["Sync Strava (/api/strava/sync)"]
    G --> H["Strava API (activities + detail enrichment)"]
    H --> I["Activity upsert (provider=strava)"]

    B --> G2["Sync Wahoo (/api/wahoo/sync)"]
    G2 --> H2["Wahoo API (workouts)"]
    H2 --> I2["Activity upsert (provider=wahoo)"]

    B --> J["Export (/api/strava/export?days=7|14|30)"]
    J --> K["syncAndLoadActivities"]
    K --> L["Zones + Metrics + Prompt + SnapshotCompare"]
    L --> M["ExportSnapshot create"]
    M --> N["ExportPayload JSON + ChatGPT Prompt"]

    B --> O["Dashboard KPIs"]
    O --> P["dedupeActivitiesAcrossProviders"]
    P --> Q["Summary (7d/30d, sport breakdown, recent activities)"]

    B --> R["/activities + /activities/[id]"]
    R --> P
```

## 2) Datenmodell (ER)

```mermaid
erDiagram
    Profile ||--o| StravaConnection : "has 0..1"
    Profile ||--o| WahooConnection : "has 0..1"
    Profile ||--o{ Activity : "has many"
    Profile ||--o{ ExportSnapshot : "has many"
    Profile ||--o{ UserSession : "has many"
    Profile ||--o{ AdminInviteCode : "createdBy"
    Profile ||--o{ AdminInviteCode : "usedBy"

    Profile {
      uuid id PK
      string email
      string displayName
      enum role
      datetime createdAt
      datetime updatedAt
    }

    StravaConnection {
      string id PK
      uuid userId UK
      string athleteId
      string athleteName
      string accessToken_encrypted
      string refreshToken_encrypted
      datetime expiresAt
      string scope
    }

    WahooConnection {
      string id PK
      uuid userId UK
      string wahooUserId
      string displayName
      string email
      string accessToken_encrypted
      string refreshToken_encrypted
      datetime expiresAt
      string scope
    }

    Activity {
      bigint id PK
      uuid userId
      string provider
      string providerActivityId
      string athleteId
      string name
      string type
      datetime startDate
      float distanceMeters
      int movingTimeSeconds
      float averageHeartrate
      float averageWatts
      json rawJson
      string zonesJson
      string providerMetricsJson
    }

    ExportSnapshot {
      string id PK
      uuid userId
      datetime rangeStart
      datetime rangeEnd
      string activityJson
      datetime createdAt
    }

    UserSession {
      string id PK
      string sessionToken UK
      uuid userId
      datetime expiresAt
    }

    AdminInviteCode {
      string id PK
      string codeHash UK
      enum targetRole
      int maxUses
      int usedCount
      datetime expiresAt
      uuid createdByUserId
      uuid usedByUserId
      datetime revokedAt
    }
```

## 3) Wichtige Beziehungen und Zusammenhänge

1. `Profile` ist der zentrale Eigentümer aller fachlichen Daten.
2. `Activity` vereint Daten aus mehreren Providern (`provider=strava|wahoo`) in einem Modell.
3. Dedupe passiert logisch in der App-Schicht (nicht per DB-Constraint), damit Dashboard/Listen keine Duplikate doppelt zählen.
4. `ExportSnapshot` speichert jeden Exportzustand und ist Basis für Trend-/Delta-Berechnung.
5. Tokens werden verschlüsselt gespeichert; OAuth-Scopes steuern, welche Detaildaten (z. B. Profilzonen) verfügbar sind.
