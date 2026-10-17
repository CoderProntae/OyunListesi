import { useEffect, useRef, type ReactNode } from "react";
import { X, Loader2, Check, HelpCircle, ArrowUpRight, Gamepad2 } from "lucide-react";
import { motion } from "framer-motion";
import { useApp } from "../lib/context";
import { compatLabels, type CompatStatus } from "../../shared/types";
import { media, external } from "../lib/api";
export function IconButton({
  label,
  children,
  onClick,
  className = "",
  disabled = false,
}: any) {
  return (
    <button
      className={"icon-btn " + className}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
// Open windows, newest last: only the top-most one handles Esc / Tab.
const openModals: HTMLElement[] = [];
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Remember where the user was before the window opened. Read during the first
  // render: a text box inside the window takes focus (autoFocus) before effects
  // run, so reading it later pointed at the window itself and focus was lost
  // (it fell to the page) when the window closed.
  const previous = useRef<HTMLElement | null>(null);
  if (previous.current === null)
    previous.current = (document.activeElement as HTMLElement | null) || document.body;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    openModals.push(element);
    const focusable = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea,select,a[href],[tabindex="0"]',
        ),
      ).filter((x) => x.offsetParent !== null);
    const timer = setTimeout(() => {
      // Keep a text box that already took focus (autoFocus). Before, the first
      // focusable element - the close button - always won, so typing right after
      // Ctrl+K / Ctrl+N / Ctrl+I went nowhere.
      if (element.contains(document.activeElement)) return;
      const all = focusable();
      (
        all.find((x) => x.hasAttribute("data-autofocus")) ||
        all.find((x) => !x.closest(".modal-head")) ||
        all[0]
      )?.focus();
    }, 80);
    // Listen on the whole page, not only inside the window: after a click on
    // plain text focus is on the page itself, and Esc / Tab used to do nothing
    // there (Tab even walked into the screen behind the window). Only the
    // top-most window reacts; handlers inside the window still run first.
    const key = (e: KeyboardEvent) => {
      if (openModals.at(-1) !== element) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const all = focusable();
        const first = all[0],
          last = all.at(-1);
        if (!element.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      openModals.splice(openModals.indexOf(element), 1);
      document.removeEventListener("keydown", key);
      const back = previous.current;
      if (back && back.isConnected && back !== document.body) back.focus();
    };
  }, []);
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={title}
        className={"modal glass " + (wide ? "wide" : "")}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton label="Kapat" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </motion.div>
    </motion.div>
  );
}
export function CompatDot({
  status,
  title,
  label,
  large = false,
}: {
  status: CompatStatus;
  title?: string;
  // 2.1.3: the game's own wording. A mark the user set says more than the
  // generic "Doğrulama gerekiyor" a screen reader would otherwise read out.
  label?: string;
  large?: boolean;
}) {
  const Icon =
    status === "recommended"
      ? Check
      : status === "unsupported"
        ? X
        : status === "minimum"
          ? Check
          : HelpCircle;
  return (
    <span
      className={`compat-dot ${status} ${large ? "large" : ""}`}
      title={title || label || compatLabels[status]}
      aria-label={label || compatLabels[status]}
    >
      <Icon size={large ? 18 : 11} />
    </span>
  );
}
export function Cover({
  name,
  cover,
  className = "",
}: {
  name: string;
  cover?: string;
  className?: string;
}) {
  return (
    <div className={"cover " + className}>
      {media(cover) ? (
        <img src={media(cover)} alt="" loading="lazy" />
      ) : (
        <>
          <Gamepad2 size={22} />
          <span>{name.substring(0, 2).toLocaleUpperCase("tr")}</span>
        </>
      )}
    </div>
  );
}
export function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button className="text-link" onClick={() => external(url)}>
      {children}
      <ArrowUpRight size={13} />
    </button>
  );
}
export function Spinner({ text = "Yükleniyor…" }: { text?: string }) {
  return (
    <span className="loading-inline">
      <Loader2 size={16} className="spin" />
      {text}
    </span>
  );
}
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        className="switch"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
export function ConfirmModal({
  title = "Emin misin?",
  text,
  onConfirm,
  danger = false,
}: any) {
  const { close } = useApp();
  return (
    <Modal
      title={title}
      onClose={close}
      footer={
        <>
          <button onClick={close}>Vazgeç</button>
          <button
            className={danger ? "danger" : "primary"}
            onClick={async () => {
              await onConfirm();
              close();
            }}
          >
            Onayla
          </button>
        </>
      }
    >
      <p className="readable">{text}</p>
    </Modal>
  );
}
