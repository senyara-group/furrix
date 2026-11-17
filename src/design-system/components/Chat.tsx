import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils';

/** Fil de messages (annoncé poliment aux lecteurs d'écran). */
export function ChatThread({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('fx-chat', className)} role="log" aria-live="polite" {...rest} />;
}

export interface MessageBubbleProps {
  from: 'me' | 'them';
  time?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function MessageBubble({ from, time, children, className }: MessageBubbleProps) {
  return (
    <p className={cx('fx-bubble', `fx-bubble--${from}`, className)}>
      {children}
      {time ? <span className="fx-bubble__time">{time}</span> : null}
    </p>
  );
}

/** Événement dans le fil (« Rencontre proposée »). */
export function SystemMessage({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('fx-sysmsg', className)}>{children}</span>;
}

export interface ChatLayoutProps {
  children: ReactNode;
  /** Fiche latérale (ordinateur). */
  side?: ReactNode;
  /** Rappel compact (téléphone). */
  context?: ReactNode;
  className?: string;
}

export function ChatLayout({ children, side, context, className }: ChatLayoutProps) {
  return (
    <div className={cx('fx-chatlay', className)}>
      <div className="fx-chatlay__main">
        {context ? <div className="fx-chatctx"><div className="fx-chatctx__body">{context}</div></div> : null}
        {children}
      </div>
      {side ? <aside className="fx-chatlay__side">{side}</aside> : null}
    </div>
  );
}
