import { ReactNode } from "react";

export function Badge({
  tone,
  children,
}: {
  tone: string;
  children: ReactNode;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Panel({
  title,
  subtitle,
  extra,
  children,
}: {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="heading">
        <div>
          {subtitle ? <p>{subtitle}</p> : null}
          <h2>{title}</h2>
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function NumInput({
  value,
  onChange,
  placeholder,
  disabled,
  suffix = "mm",
  invalid,
  min = 0,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
  disabled?: boolean;
  suffix?: string;
  invalid?: boolean;
  min?: number;
}) {
  return (
    <div className={`num-input ${invalid ? "invalid" : ""}`}>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        value={value === "" ? "" : String(value)}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === "") {
            onChange("");
            return;
          }
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : "");
        }}
      />
      <span className="unit">{suffix}</span>
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="empty-hint">{children}</p>;
}
