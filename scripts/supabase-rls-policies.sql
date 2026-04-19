-- Supabase RLS hardening for application tables
-- Safe to re-run (drops/recreates policies).

begin;

-- ============================================================================
-- Profile
-- ============================================================================
alter table public."Profile" enable row level security;

drop policy if exists "profile_select_own" on public."Profile";
create policy "profile_select_own"
on public."Profile"
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profile_insert_own" on public."Profile";
create policy "profile_insert_own"
on public."Profile"
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profile_update_own" on public."Profile";
create policy "profile_update_own"
on public."Profile"
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profile_delete_own" on public."Profile";
create policy "profile_delete_own"
on public."Profile"
for delete
to authenticated
using (auth.uid() = id);

-- ============================================================================
-- UserSession
-- ============================================================================
alter table public."UserSession" enable row level security;

drop policy if exists "usersession_select_own" on public."UserSession";
create policy "usersession_select_own"
on public."UserSession"
for select
to authenticated
using (auth.uid() = "userId");

drop policy if exists "usersession_insert_own" on public."UserSession";
create policy "usersession_insert_own"
on public."UserSession"
for insert
to authenticated
with check (auth.uid() = "userId");

drop policy if exists "usersession_update_own" on public."UserSession";
create policy "usersession_update_own"
on public."UserSession"
for update
to authenticated
using (auth.uid() = "userId")
with check (auth.uid() = "userId");

drop policy if exists "usersession_delete_own" on public."UserSession";
create policy "usersession_delete_own"
on public."UserSession"
for delete
to authenticated
using (auth.uid() = "userId");

-- ============================================================================
-- StravaConnection
-- ============================================================================
alter table public."StravaConnection" enable row level security;

drop policy if exists "stravaconnection_select_own" on public."StravaConnection";
create policy "stravaconnection_select_own"
on public."StravaConnection"
for select
to authenticated
using (auth.uid() = "userId");

drop policy if exists "stravaconnection_insert_own" on public."StravaConnection";
create policy "stravaconnection_insert_own"
on public."StravaConnection"
for insert
to authenticated
with check (auth.uid() = "userId");

drop policy if exists "stravaconnection_update_own" on public."StravaConnection";
create policy "stravaconnection_update_own"
on public."StravaConnection"
for update
to authenticated
using (auth.uid() = "userId")
with check (auth.uid() = "userId");

drop policy if exists "stravaconnection_delete_own" on public."StravaConnection";
create policy "stravaconnection_delete_own"
on public."StravaConnection"
for delete
to authenticated
using (auth.uid() = "userId");

-- ============================================================================
-- WahooConnection
-- ============================================================================
alter table public."WahooConnection" enable row level security;

drop policy if exists "wahooconnection_select_own" on public."WahooConnection";
create policy "wahooconnection_select_own"
on public."WahooConnection"
for select
to authenticated
using (auth.uid() = "userId");

drop policy if exists "wahooconnection_insert_own" on public."WahooConnection";
create policy "wahooconnection_insert_own"
on public."WahooConnection"
for insert
to authenticated
with check (auth.uid() = "userId");

drop policy if exists "wahooconnection_update_own" on public."WahooConnection";
create policy "wahooconnection_update_own"
on public."WahooConnection"
for update
to authenticated
using (auth.uid() = "userId")
with check (auth.uid() = "userId");

drop policy if exists "wahooconnection_delete_own" on public."WahooConnection";
create policy "wahooconnection_delete_own"
on public."WahooConnection"
for delete
to authenticated
using (auth.uid() = "userId");

-- ============================================================================
-- Activity
-- ============================================================================
alter table public."Activity" enable row level security;

drop policy if exists "activity_select_own" on public."Activity";
create policy "activity_select_own"
on public."Activity"
for select
to authenticated
using (auth.uid() = "userId");

drop policy if exists "activity_insert_own" on public."Activity";
create policy "activity_insert_own"
on public."Activity"
for insert
to authenticated
with check (auth.uid() = "userId");

drop policy if exists "activity_update_own" on public."Activity";
create policy "activity_update_own"
on public."Activity"
for update
to authenticated
using (auth.uid() = "userId")
with check (auth.uid() = "userId");

drop policy if exists "activity_delete_own" on public."Activity";
create policy "activity_delete_own"
on public."Activity"
for delete
to authenticated
using (auth.uid() = "userId");

-- ============================================================================
-- ExportSnapshot
-- ============================================================================
alter table public."ExportSnapshot" enable row level security;

drop policy if exists "exportsnapshot_select_own" on public."ExportSnapshot";
create policy "exportsnapshot_select_own"
on public."ExportSnapshot"
for select
to authenticated
using (auth.uid() = "userId");

drop policy if exists "exportsnapshot_insert_own" on public."ExportSnapshot";
create policy "exportsnapshot_insert_own"
on public."ExportSnapshot"
for insert
to authenticated
with check (auth.uid() = "userId");

drop policy if exists "exportsnapshot_update_own" on public."ExportSnapshot";
create policy "exportsnapshot_update_own"
on public."ExportSnapshot"
for update
to authenticated
using (auth.uid() = "userId")
with check (auth.uid() = "userId");

drop policy if exists "exportsnapshot_delete_own" on public."ExportSnapshot";
create policy "exportsnapshot_delete_own"
on public."ExportSnapshot"
for delete
to authenticated
using (auth.uid() = "userId");

commit;
