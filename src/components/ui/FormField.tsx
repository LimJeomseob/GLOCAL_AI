import { ReactNode, useId } from "react";
import clsx from "clsx";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: (inputProps: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}

/** 접근성 고려 폼 필드 래퍼: label-input 연결, 에러/힌트를 aria-describedby로 연결 */
export function FormField({ label, required, error, hint, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-slate-800">
        {label}
        {required && (
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only">(필수)</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": !!error })}
      {hint && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={clsx("text-xs font-medium text-red-600")}>
          {error}
        </p>
      )}
    </div>
  );
}

export const inputBaseClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent disabled:bg-slate-100 disabled:text-slate-400 sm:text-base";
