"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";

type PendingSubmitButtonProps = ComponentProps<"button"> & {
  pendingLabel?: ReactNode;
};

export function PendingSubmitButton({
  children,
  disabled,
  pendingLabel = "Working...",
  type = "submit",
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button aria-disabled={disabled || pending} disabled={disabled || pending} type={type} {...props}>
      {pending ? pendingLabel : children}
    </button>
  );
}
