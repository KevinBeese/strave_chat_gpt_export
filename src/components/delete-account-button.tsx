"use client";

import { useState } from "react";

type DeleteAccountButtonProps = {
  targetUserId: string;
  idleLabel?: string;
  pendingLabel?: string;
  confirmText?: string;
};

export function DeleteAccountButton({
  targetUserId,
  idleLabel = "Konto loeschen",
  pendingLabel = "Konto wird geloescht...",
  confirmText = "Moechtest du dieses Konto wirklich loeschen? Alle Verbindungen und Daten werden entfernt.",
}: DeleteAccountButtonProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <form
      action="/api/account/delete"
      method="post"
      onSubmit={(event) => {
        if (!window.confirm(confirmText)) {
          event.preventDefault();
          return;
        }

        setIsPending(true);
      }}
    >
      <input name="targetUserId" type="hidden" value={targetUserId} />
      <button
        className="rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? pendingLabel : idleLabel}
      </button>
    </form>
  );
}
