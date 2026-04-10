export function DisconnectButton() {
  return (
    <form action="/api/strava/disconnect" method="post">
      <button
        className="rounded-full border border-[color:var(--border)] px-5 py-3 text-sm font-medium text-black/72 transition hover:bg-black/5"
        type="submit"
      >
        Verbindung trennen
      </button>
    </form>
  );
}
