"use client";

import { useState } from "react";

type PendingSubmitButtonProps = {
  className: string;
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
};

export function PendingSubmitButton({
  className,
  idleLabel,
  pendingLabel,
  disabled = false,
}: PendingSubmitButtonProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      className={className}
      disabled={disabled}
      onClick={(event) => {
        const form = event.currentTarget.form;
        if (form && !form.checkValidity()) {
          form.reportValidity();
          return;
        }

        // Keep the button submittable; only switch the label for feedback.
        // Disabling here can cancel form submission in some browsers.
        setIsPending(true);
      }}
      type="submit"
    >
      {isPending ? pendingLabel : idleLabel}
    </button>
  );
}
