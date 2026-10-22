import type { ComponentChildren } from 'preact';
import { t } from '../i18n.ts';
import { foldSr } from '../lib/text.ts';
import { Icon } from './Icon.tsx';

/* ───────────── Chip ───────────── */

interface ChipProps {
  children: ComponentChildren;
  onClick?: (() => void) | undefined;
  tone?: 'neutral' | 'teal' | 'accent';
  /** Мелкая подпись справа (часть речи, род, транскрипция) */
  sub?: string | undefined;
  lang?: string;
}

export function Chip({ children, onClick, tone = 'neutral', sub, lang }: ChipProps) {
  const cls = `chip chip--${tone}${onClick ? ' chip--tap' : ''}`;
  const inner = (
    <>
      <span class="chip__text">{children}</span>
      {sub ? <span class="chip__sub">{sub}</span> : null}
    </>
  );
  return onClick ? (
    <button type="button" class={cls} onClick={onClick} lang={lang}>
      {inner}
    </button>
  ) : (
    <span class={cls} lang={lang}>
      {inner}
    </span>
  );
}

/* ───────────── Segmented / Tabs ───────────── */

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  variant?: 'tabs' | 'pills';
  ariaLabel?: string;
}

export function Segmented<T extends string>({ options, value, onChange, variant = 'pills', ariaLabel }: SegmentedProps<T>) {
  return (
    <div class={`seg seg--${variant}`} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          class={o.value === value ? 'seg__item is-active' : 'seg__item'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Состояния ───────────── */

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div class="skeleton-block" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} class="skeleton" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon, text, title }: { icon: 'star' | 'history' | 'search'; text: string; title?: string }) {
  return (
    <div class="empty">
      <div class="empty__icon">
        <Icon name={icon} size={30} />
      </div>
      {title ? <h2>{title}</h2> : null}
      <p>{text}</p>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      class={checked ? 'switch is-on' : 'switch'}
      onClick={() => onChange(!checked)}
    >
      <span class="switch__thumb" />
    </button>
  );
}

export function Notice({ children }: { children: ComponentChildren }) {
  return <div class="notice">{children}</div>;
}

export function ErrorBox({
  offline,
  onRetry,
  onSettings,
}: {
  offline: boolean;
  onRetry: () => void;
  onSettings?: () => void;
}) {
  return (
    <div class="empty">
      <div class="empty__icon">
        <Icon name="offline" size={30} />
      </div>
      <h2>{offline ? t('netError') : t('loadError')}</h2>
      <p>{offline ? t('netErrorBody') : t('loadErrorHint')}</p>
      <div class="actions">
        <button type="button" class="btn btn--outline" onClick={onRetry}>
          {t('retry')}
        </button>
        {onSettings ? (
          <button type="button" class="btn btn--text" onClick={onSettings}>
            {t('toSettings')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div class="progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ───────────── Подсветка слова в предложении ───────────── */

/** Подсвечивает слово и его формы: сравнение по основе (первые буквы ключа без диакритики), любое письмо. */
export function Highlight({ text, foldKey }: { text: string; foldKey: string }) {
  const stem = foldKey.length > 4 ? foldKey.slice(0, foldKey.length - 2) : foldKey;
  const nodes: ComponentChildren[] = [];
  let last = 0;
  for (const m of text.matchAll(/\p{L}+/gu)) {
    const at = m.index ?? 0;
    const f = foldSr(m[0]);
    const hit = stem.length > 0 && (f === stem || (foldKey.length > 4 && f.startsWith(stem)));
    if (!hit) continue;
    if (at > last) nodes.push(text.slice(last, at));
    nodes.push(<mark key={at}>{m[0]}</mark>);
    last = at + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
