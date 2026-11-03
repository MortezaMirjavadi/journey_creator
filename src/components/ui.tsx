import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'text-button',
  danger: 'secondary danger',
  subtle: 'text-button',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'small',
  md: '',
  icon: 'icon-button',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={className} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={className} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={className} {...props}>
        {children}
      </select>
    );
  },
);

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'outline';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'badge',
  brand: 'badge',
  success: 'badge green',
  warning: 'badge amber',
  danger: 'badge red',
  outline: 'badge line',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn(BADGE_TONES[tone], className)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn('spinner inline', className)} />;
}

export function Field({
  id,
  label,
  required,
  help,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={id} className={cn('field', className)}>
      {label}
      {required ? <span aria-hidden> *</span> : null}
      {children}
      {error ? (
        <span id={`${id}-error`} role="alert" className="field-error">
          {error}
        </span>
      ) : help ? (
        <span className="help">{help}</span>
      ) : null}
    </label>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-backdrop" />
        <DialogPrimitive.Content
          className={cn('modal', width === 'sm' && 'narrow')}
          style={width === 'lg' ? { width: 900 } : undefined}
        >
          <header>
            <div>
              <DialogPrimitive.Title asChild>
                <h2>{title}</h2>
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description asChild>
                  <p>{description}</p>
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" className="icon-button" aria-label={t('common.close')}>
                ×
              </button>
            </DialogPrimitive.Close>
          </header>
          {children ? <div className="modal-body">{children}</div> : null}
          {footer ? <footer>{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Drawer({
  open,
  onOpenChange,
  title,
  side = 'end',
  headerless = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  side?: 'start' | 'end';
  headerless?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drawer-backdrop" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn('drawer', side === 'start' && 'start')}
        >
          {headerless ? (
            <DialogPrimitive.Title className="hidden">{title}</DialogPrimitive.Title>
          ) : (
            <header>
              <DialogPrimitive.Title asChild>
                <h2>{title}</h2>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button type="button" className="icon-button" aria-label={t('common.close')}>
                  ×
                </button>
              </DialogPrimitive.Close>
            </header>
          )}
          <div className="drawer-body">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? <div style={{ fontSize: 30, color: '#a9c1dd', marginBottom: 8 }}>{icon}</div> : null}
      <h3 style={{ margin: '0 0 6px', color: '#839bb5' }}>{title}</h3>
      {description ? <p style={{ fontSize: 11 }}>{description}</p> : null}
      {action ? <div className="actions" style={{ justifyContent: 'center', marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}
