import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
  type PointerEvent, type ReactElement, type ReactNode, type Ref,
} from 'react';
import { Icon } from '../icons/Icon';
import { haptic } from '../platform';
import { cx, type PhotoSource } from '../utils';
import { Tag } from './Feedback';
import { Text } from './Text';

export type SwipeDecision = 'like' | 'pass';

export interface SwipeDeckHandle {
  like: () => void;
  pass: () => void;
  reset: () => void;
}

export interface SwipeDeckProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onDecide: (item: T, decision: SwipeDecision) => void;
  /** Nom de la carte du dessus, lu par les lecteurs d'écran. */
  getLabel?: (item: T) => string;
  /** Index contrôlé ; sinon la pile avance seule. */
  index?: number;
  /** Distance (px) au-delà de laquelle le glissement décide. */
  threshold?: number;
  likeLabel?: string;
  passLabel?: string;
  /** Affiché quand la pile est vide. */
  empty?: ReactNode;
  className?: string;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function SwipeDeckImpl<T>(
  { items, getKey, renderCard, onDecide, getLabel, index, threshold = 70, likeLabel = "J'aime", passLabel = 'Passer', empty, className }: SwipeDeckProps<T>,
  ref: Ref<SwipeDeckHandle>,
) {
  const controlled = index !== undefined;
  const [inner, setInner] = useState(0);
  const idx = controlled ? index : inner;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<SwipeDecision | null>(null);
  const startX = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const decide = useCallback(
    (decision: SwipeDecision) => {
      const item = items[idx];
      if (item === undefined || leaving) return;
      haptic('light');
      const commit = () => {
        onDecide(item, decision);
        if (!controlled) setInner((i) => i + 1);
        setLeaving(null);
        setDragging(false);
        setDx(0);
      };
      if (prefersReducedMotion()) return commit();
      setDragging(false);
      setLeaving(decision);
      timer.current = setTimeout(commit, 220);
    },
    [items, idx, leaving, onDecide, controlled],
  );

  useImperativeHandle(ref, () => ({
    like: () => decide('like'),
    pass: () => decide('pass'),
    reset: () => {
      setInner(0);
      setDx(0);
      setLeaving(null);
    },
  }), [decide]);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (leaving) return;
    startX.current = e.clientX;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture indisponible : le glissement reste possible */
    }
    setDragging(true);
    setDx(0);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging) setDx(e.clientX - startX.current);
  };
  const onUp = () => {
    if (!dragging) return;
    if (dx > threshold) decide('like');
    else if (dx < -threshold) decide('pass');
    else {
      setDragging(false);
      setDx(0);
    }
  };

  if (idx >= items.length) return <>{empty}</>;
  const visible: Array<{ item: T; pos: number }> = [];
  for (let k = Math.min(idx + 2, items.length - 1); k >= idx; k--) visible.push({ item: items[k] as T, pos: k - idx });

  return (
    <section className={cx('fx-swipe', className)} aria-label="Cartes à balayer">
      {visible.map(({ item, pos }) => {
        const top = pos === 0;
        const drift = top && leaving ? (leaving === 'like' ? 1 : -1) * 140 : 0;
        const x = top && !leaving ? dx : 0;
        const transform = top
          ? leaving ? `translateX(${drift}%) rotate(${drift / 8}deg)` : `translateX(${x}px) rotate(${(x / 18).toFixed(2)}deg)`
          : `translateY(${pos * 10}px) scale(${1 - pos * 0.04})`;
        const likeO = top ? (leaving === 'like' ? 1 : Math.max(0, Math.min(1, x / threshold))) : 0;
        const passO = top ? (leaving === 'pass' ? 1 : Math.max(0, Math.min(1, -x / threshold))) : 0;
        return (
          <div
            key={getKey(item)}
            className="fx-swipe__card"
            data-pos={pos}
            style={{ transform, transition: top && dragging ? 'none' : 'transform var(--fx-motion-deck) ease' }}
            role={top ? 'group' : undefined}
            aria-label={top ? getLabel?.(item) : undefined}
            aria-hidden={top ? undefined : true}
            onPointerDown={top ? onDown : undefined}
            onPointerMove={top ? onMove : undefined}
            onPointerUp={top ? onUp : undefined}
            onPointerCancel={top ? onUp : undefined}
          >
            {renderCard(item)}
            <span className="fx-swipe__stamp fx-swipe__stamp--like" style={{ opacity: likeO }} aria-hidden="true">{likeLabel}</span>
            <span className="fx-swipe__stamp fx-swipe__stamp--pass" style={{ opacity: passO }} aria-hidden="true">{passLabel}</span>
          </div>
        );
      })}
    </section>
  );
}

/** Pile de profils à balayer (rencontres). Toujours accompagnée de `SwipeActions` (alternative au geste). */
export const SwipeDeck = forwardRef(SwipeDeckImpl) as <T>(
  props: SwipeDeckProps<T> & { ref?: Ref<SwipeDeckHandle> },
) => ReactElement | null;

export interface SwipeProfileProps {
  photo: PhotoSource & { alt: string };
  distance?: ReactNode;
  name: ReactNode;
  description?: ReactNode;
  goalsLabel?: string;
  goals?: string[];
  traits?: string[];
  owner?: { initial: string; name: string; note?: string };
}

/** Contenu d'une carte de la pile. */
export function SwipeProfile({ photo, distance, name, description, goalsLabel = 'Cherche', goals, traits, owner }: SwipeProfileProps) {
  return (
    <>
      <div className="fx-profile__photo">
        <img src={photo.src} alt={photo.alt} draggable={false} style={photo.position ? { objectPosition: photo.position } : undefined} />
        {distance ? <span className="fx-profile__dist"><Icon name="pin" size={14} strokeWidth={2.2} />{distance}</span> : null}
      </div>
      <div className="fx-profile__info">
        <p className="fx-profile__name">{name}</p>
        {description ? <p className="fx-profile__desc">{description}</p> : null}
        {goals?.length ? (
          <div className="fx-profile__goals">
            <Text variant="kicker" as="span">{goalsLabel}</Text>
            {goals.map((g) => <Tag key={g} kind="goal">{g}</Tag>)}
          </div>
        ) : null}
        {traits?.length ? (
          <ul className="fx-profile__traits">
            {traits.map((t) => <li key={t}><Icon name="check" size={16} strokeWidth={2.2} />{t}</li>)}
          </ul>
        ) : null}
        {owner ? (
          <p className="fx-profile__owner">
            <span className="fx-profile__oav" aria-hidden="true">{owner.initial}</span>
            <span><b>{owner.name}</b>{owner.note ? `, ${owner.note}` : ''}</span>
          </p>
        ) : null}
      </div>
    </>
  );
}

export interface SwipeActionsProps {
  /** Nom de l'animal concerné (« Moka »), pour les libellés accessibles. */
  subject: string;
  onPass: () => void;
  onInfo?: () => void;
  onLike: () => void;
  passLabel?: string;
  infoLabel?: string;
  likeLabel?: string;
  hint?: ReactNode;
  className?: string;
}

export function SwipeActions({
  subject, onPass, onInfo, onLike, passLabel = 'Passer', infoLabel = 'Fiche', likeLabel = "J'aime", hint, className,
}: SwipeActionsProps) {
  return (
    <>
      <div className={cx('fx-swipe-actions', className)} role="group" aria-label={`Décider pour ${subject}`}>
        <div className="fx-swipe-actions__item">
          <button type="button" className="fx-swipe-btn fx-swipe-btn--pass" aria-label={`${passLabel} ${subject}`} onClick={onPass}>
            <Icon name="close" size={26} strokeWidth={2.4} />
          </button>
          <span>{passLabel}</span>
        </div>
        {onInfo ? (
          <div className="fx-swipe-actions__item">
            <button type="button" className="fx-swipe-btn fx-swipe-btn--info" aria-label={`Voir la fiche de ${subject}`} onClick={onInfo}>
              <Icon name="info" size={20} strokeWidth={2.2} />
            </button>
            <span>{infoLabel}</span>
          </div>
        ) : null}
        <div className="fx-swipe-actions__item">
          <button type="button" className="fx-swipe-btn fx-swipe-btn--like" aria-label={`${likeLabel} ${subject}`} onClick={onLike}>
            <Icon name="heart" size={26} strokeWidth={2.2} />
          </button>
          <span>{likeLabel}</span>
        </div>
      </div>
      {hint ? <p className="fx-swipe-hint">{hint}</p> : null}
    </>
  );
}

export type MatchSide = { photo: PhotoSource } | { initials: string };

function MatchFace({ side }: { side: MatchSide }) {
  if ('photo' in side) {
    return <img className="fx-match__avatar" src={side.photo.src} alt={side.photo.alt ?? ''} style={side.photo.position ? { objectPosition: side.photo.position } : undefined} />;
  }
  return <span className="fx-mono fx-match__avatar" aria-hidden="true">{side.initials}</span>;
}

export function MatchPair({ left, right }: { left: MatchSide; right: MatchSide }) {
  return (
    <div className="fx-match__pair">
      <MatchFace side={left} />
      <span className="fx-match__heart"><Icon name="heartFill" size={26} /></span>
      <MatchFace side={right} />
    </div>
  );
}

export interface MatchScreenProps {
  left: MatchSide;
  right: MatchSide;
  /** « C'est un match ! » (seul point d'exclamation autorisé). */
  title: ReactNode;
  text?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function MatchScreen({ left, right, title, text, actions, className }: MatchScreenProps) {
  return (
    <div className={cx('fx-match', className)}>
      <MatchPair left={left} right={right} />
      <Text variant="match-title">{title}</Text>
      {text ? <Text variant="body" className="fx-match__text">{text}</Text> : null}
      {actions ? <div className="fx-match__actions">{actions}</div> : null}
    </div>
  );
}
