import {
  useEffect,
  useRef,
  useId,
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  Box,
  X,
  RotateCw,
  Layers,
  Cpu,
  HardDrive,
  Network,
  Cable,
  Monitor,
  Laptop,
  CircuitBoard,
  Zap,
  MemoryStick,
  Gamepad2,
  Shield,
  Server,
  Home,
  Play,
  Activity,
  Code2,
  Sparkles,
} from 'lucide-react';
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <span className="brand-mark">
        <Layers size={22} strokeWidth={2} />
      </span>
      {!small && (
        <span>
          stacked<span className="brand-light">deck</span>
          <span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`badge ${tone || String(children).toLowerCase().replaceAll(' ', '-')}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Box size={30} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="skeleton-grid" aria-label="Loading" role="status">
      {[1, 2, 3].map((v) => (
        <div key={v} className="skeleton" />
      ))}
      <span className="sr-only">Loading your workspace…</span>
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={22} />
      <p>{message}</p>
      <button className="button secondary" onClick={retry}>
        <RotateCw size={16} />
        Try again
      </button>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const prior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = prior;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-labelledby="modal-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement(child) && ['input', 'select', 'textarea'].includes(String(child.type))
          ? cloneElement(child as ReactElement<{ id: string; 'aria-describedby'?: string }>, {
              id,
              'aria-describedby': hint ? `${id}-hint` : undefined,
            })
          : child,
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function CategoryIcon({ category, size = 20 }: { category: string; size?: number }) {
  const Icon = /GPU|CPU/.test(category)
    ? Cpu
    : /SSD|HDD|MicroSD/.test(category)
      ? HardDrive
      : /Pi|Board|Microcontroller/.test(category)
        ? CircuitBoard
        : /Networking|Switch|Router/.test(category)
          ? Network
          : /Cable|Adapter/.test(category)
            ? Cable
            : /Laptop/.test(category)
              ? Laptop
              : /Server/.test(category)
                ? Server
                : /Monitor|Computer|PC|All-in-One/.test(category)
                  ? Monitor
                  : /Power/.test(category)
                    ? Zap
                    : /RAM/.test(category)
                      ? MemoryStick
                      : Box;
  return <Icon size={size} />;
}
export function TemplateIcon({ name, size = 24 }: { name: string; size?: number }) {
  const icons: Record<string, typeof Box> = {
    server: Server,
    shield: Shield,
    gamepad: Gamepad2,
    home: Home,
    play: Play,
    box: Box,
    network: Network,
    activity: Activity,
    code: Code2,
    sparkles: Sparkles,
  };
  const Icon = icons[name] || Box;
  return <Icon size={size} />;
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
