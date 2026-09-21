import type { ReactNode } from "react";

export function Badge({ tone, children }: { tone: "ok" | "warn" | "bad" | "neutral" | "lock"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="empty-hint">{children}</p>;
}

export function NumInput(props: {
  value: number | null;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (raw: string) => void;
  step?: number;
}) {
  return (
    <input
      className={props.invalid ? "input-bad" : ""}
      type="number"
      inputMode="decimal"
      min={0}
      step={props.step ?? 1}
      placeholder="缺"
      disabled={props.disabled}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}
