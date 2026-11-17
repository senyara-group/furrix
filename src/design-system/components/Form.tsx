import {
  cloneElement, forwardRef, isValidElement, useId,
  type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes,
} from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../utils';
import { SendButton } from './Button';

/** Champ d'une ligne (52 px, 16 px de texte sur téléphone). À placer dans un `Field`. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('fx-input', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx('fx-input', className)} {...rest} />;
});

type ControlProps = { id?: string; 'aria-describedby'?: string };

export interface FieldProps {
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  /** Message qui dit quoi faire (« Indique le prénom de ton animal »). */
  error?: ReactNode;
  /** Le contrôle : `Input` ou `Textarea`. */
  children: ReactElement<ControlProps>;
  className?: string;
}

/** Étiquette, aide, erreur et contrôle reliés pour les lecteurs d'écran. */
export function Field({ label, optional, hint, error, children, className }: FieldProps) {
  const uid = useId();
  const id = children.props.id ?? `${uid}-input`;
  // L'aide est masquée quand une erreur s'affiche : ne pas y faire référence.
  const hintId = hint && !error ? `${uid}-hint` : undefined;
  const errId = error ? `${uid}-err` : undefined;
  const described = [children.props['aria-describedby'], hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('fx-field', className)}>
      <label className="fx-label" htmlFor={id}>
        {label}
        {optional ? <span className="fx-label__opt"> (facultatif)</span> : null}
      </label>
      {isValidElement(children)
        ? cloneElement(children, { id, 'aria-describedby': described, 'aria-invalid': error ? true : undefined } as ControlProps)
        : children}
      {hint && !error ? <p className="fx-hint" id={hintId}>{hint}</p> : null}
      {error ? <p className="fx-field__error" id={errId} role="alert"><Icon name="warning" size={16} />{error}</p> : null}
    </div>
  );
}

export interface ComposerProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  /** Envoi en cours : le texte reste affiché, un second envoi est bloqué. */
  sending?: boolean;
  /** Longueur maximale du message (2 000 caractères par défaut, comme côté serveur). */
  maxLength?: number;
  className?: string;
}

/** Nombre de caractères restants à partir duquel le compteur s'affiche. */
const COUNTER_FROM = 200;

/** Saisie d'un message + bouton d'envoi (actif seulement si le texte n'est ni vide ni trop long). */
export function Composer({
  value, onChange, onSend, placeholder = 'Ton message', label = 'Message', disabled, sending = false, maxLength = 2000, className,
}: ComposerProps) {
  const counterId = useId();
  const length = value.trim().length;
  const remaining = maxLength - value.length;
  const canSend = !disabled && !sending && length > 0 && length <= maxLength;
  return (
    <form
      className={cx('fx-composer', className)}
      aria-busy={sending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        aria-describedby={remaining <= COUNTER_FROM ? counterId : undefined}
        onChange={(e) => onChange(e.target.value)}
        enterKeyHint="send"
      />
      <SendButton type="submit" label="Envoyer" loading={sending} disabled={!sending && !canSend} />
      {remaining <= COUNTER_FROM ? (
        <p className="fx-composer__count fx-num" id={counterId} aria-live="polite">
          {remaining > 0 ? `${remaining} caractère${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}` : 'Limite atteinte'}
        </p>
      ) : null}
    </form>
  );
}
