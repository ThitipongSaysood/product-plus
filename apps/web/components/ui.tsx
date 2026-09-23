"use client";
// OMNIX components (design-system §5). Client-only: server components import `cn` from lib/cn.
import {
  useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";
import { CheckCircleIcon, ChevronDownIcon, ErrorCircleIcon, InfoCircleIcon, XIcon } from "./icons";

export { cn };
export const CONTROL_CLASS = "ox-control";

type Tone = "accent" | "success" | "warning" | "danger" | "info";

export function Card({ children, body = true, className }: { children: ReactNode; body?: boolean; className?: string }) {
  return <div className={cn("ox-card", className)}>{body ? <div className="ox-card__body">{children}</div> : children}</div>;
}

export function CardFoot({ children }: { children: ReactNode }) {
  return <div className="ox-card__foot">{children}</div>;
}

export function SectionTitle({ title, sub, action, as: H = "h2" }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="ox-section-title">
      <div>
        <H>{title}</H>
        {sub ? <div className="ox-xs ox-muted">{sub}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({ tone, color, children, title }: { tone?: Tone; color?: string; children: ReactNode; title?: string }) {
  return (
    <span className={cn("ox-badge", tone && `ox-badge--${tone}`)} style={color ? ({ "--c": color } as React.CSSProperties) : undefined} title={title}>
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone?: "success" | "warning" | "danger" }) {
  return <span className={cn("ox-dot", tone && `ox-dot--${tone}`)} aria-hidden="true" />;
}

export function Chip({ active, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" aria-pressed={active} className={cn("ox-chip", active && "is-active", className)} {...rest}>
      {children}
    </button>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm";
  icon?: ReactNode;
  iconOnly?: boolean;
  block?: boolean;
};

export function Button({ variant = "secondary", size, icon, iconOnly, block, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn("ox-btn", `ox-btn--${variant}`, size && `ox-btn--${size}`, iconOnly && "ox-btn--icon", block && "ox-btn--block", className)}
      title={iconOnly ? rest["aria-label"] : undefined}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function Field({ label, help, error, required, children, htmlFor }: {
  label: ReactNode; help?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; htmlFor?: string;
}) {
  return (
    <div className="ox-field">
      <label className={cn("ox-label", required && "ox-label--required")} htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <div className="ox-error" role="alert">{error}</div> : help ? <div className="ox-help">{help}</div> : null}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL_CLASS, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL_CLASS, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL_CLASS, className)} {...rest}>{children}</select>;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="ox-toggle">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ox-toggle__track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="ox-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const ALERT_ICON = { success: CheckCircleIcon, warning: ErrorCircleIcon, danger: ErrorCircleIcon, info: InfoCircleIcon };

export function Alert({ tone = "info", title, children, action }: { tone?: "success" | "warning" | "danger" | "info"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = ALERT_ICON[tone];
  return (
    <div className={cn("ox-alert", `ox-alert--${tone}`)} role="status">
      <Icon size={18} />
      <div className="ox-alert__body">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Modal({ title, onClose, foot, wide, children, closeLabel }: {
  title: ReactNode; onClose: () => void; foot?: ReactNode; wide?: boolean; children: ReactNode; closeLabel: string;
}) {
  const id = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ox-modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("ox-modal", wide && "ox-modal--wide")} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="ox-modal__head ox-row">
          <span id={id} style={{ flex: 1 }}>{title}</span>
          <Button variant="ghost" size="sm" iconOnly aria-label={closeLabel} icon={<XIcon />} onClick={onClose} />
        </div>
        <div className="ox-modal__body">{children}</div>
        {foot ? <div className="ox-modal__foot">{foot}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ox-empty">
      <div className="ox-empty__title">{title}</div>
      {body ? <div>{body}</div> : null}
      {action}
    </div>
  );
}

/** Filter dropdown: a chip that opens a menu. Closes on outside click / Esc. */
export function Dropdown({ label, active, width, children }: {
  label: ReactNode; active?: boolean; width?: number; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="ap-dropdown" ref={ref}>
      <button
        type="button"
        className={cn("ox-chip", active && "is-active")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <ChevronDownIcon size={16} />
      </button>
      {open ? (
        <div className="ap-dropdown__menu" role="menu" id={menuId} style={width ? { minWidth: width } : undefined}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

/** Free-text combobox with suggestions (values outside the list are allowed). */
export function ComboBox({ value, onChange, options, placeholder, id, "aria-label": ariaLabel }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; id?: string; "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const q = value.trim().toLowerCase();
  const shown = options.filter((o) => !q || o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)).slice(0, 50);
  const pick = (v: string) => { onChange(v); setOpen(false); };
  return (
    <div className="ap-dropdown" style={{ display: "block" }}>
      <input
        id={id}
        className={CONTROL_CLASS}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[hi] ? `${listId}-${hi}` : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && open && shown[hi]) { e.preventDefault(); pick(shown[hi].value); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && shown.length ? (
        <div className="ap-dropdown__menu" role="listbox" id={listId} style={{ right: 0 }}>
          {shown.map((o, i) => (
            <button
              key={o.value}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === hi}
              className="ap-dropdown__item"
              onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The only way to render a table (design-system §0.9). */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ox-table-wrap" role="region" tabIndex={0} aria-label={label}>
      {children}
    </div>
  );
}

/** pct: 0..100, or null when it cannot be estimated (indeterminate — no aria-valuenow). */
export function ProgressBar({ pct, label }: { pct: number | null; label: string }) {
  if (pct == null) {
    return (
      <div className="ap-progress ap-progress--idle" role="progressbar" aria-label={label} aria-valuetext={label}>
        <div />
      </div>
    );
  }
  const v = Math.max(2, Math.min(100, pct));
  return (
    <div className="ap-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={label}>
      <div style={{ width: `${v}%` }} />
    </div>
  );
}

/** Submit button that asks window.confirm(message) first. */
export function ConfirmSubmit({ message, variant = "danger", children, ...rest }: ButtonProps & { message: string }) {
  return (
    <Button
      type="submit"
      variant={variant}
      {...rest}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
        else rest.onClick?.(e);
      }}
    >
      {children}
    </Button>
  );
}
