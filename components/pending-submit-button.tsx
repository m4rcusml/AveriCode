"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";

type PendingSubmitButtonProps = ComponentProps<"button"> & {
  pendingLabel?: ReactNode;
};

export function PendingSubmitButton({
  children,
  disabled,
  pendingLabel = "Salvando…",
  type = "submit",
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button {...props} aria-disabled={disabled || pending} aria-busy={pending} disabled={disabled || pending} type={type}>
      {pending ? pendingLabel : children}
    </button>
  );
}
