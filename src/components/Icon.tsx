import type { ComponentChildren } from 'preact';

export type IconName =
  | 'search'
  | 'star'
  | 'history'
  | 'settings'
  | 'volume'
  | 'back'
  | 'close'
  | 'share'
  | 'translate'
  | 'chevron'
  | 'trash'
  | 'offline'
  | 'sparkle'
  | 'copy'
  | 'arrow-ul'
  | 'check'
  | 'shuffle'
  | 'info'
  | 'arrow-right'
  | 'palette'
  | 'data'
  | 'book';

const PATHS: Record<IconName, ComponentChildren> = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  star: <path d="m12 3.2 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z" />,
  history: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
      <circle cx="16" cy="7" r="2.4" />
      <circle cx="8" cy="17" r="2.4" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5v5h3.4l4.6 4V5.5l-4.6 4z" />
      <path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8" />
    </>
  ),
  back: <path d="m14.5 5-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  share: (
    <>
      <circle cx="6.5" cy="12" r="2.4" />
      <circle cx="17.5" cy="6.5" r="2.4" />
      <circle cx="17.5" cy="17.5" r="2.4" />
      <path d="m8.6 10.9 6.8-3.3M8.6 13.1l6.8 3.3" />
    </>
  ),
  translate: (
    <>
      <path d="M4 6h9M8.5 4v2M6 6c.4 3.6 2.8 6 6 7.6M12.2 6c-.6 3.2-3 6.2-7.2 8" />
      <path d="m13 20 3.8-8.5L20.6 20M14.4 17h4.8" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  trash: <path d="M5 7h14M9.5 7V4.8h5V7M7 7l.9 12.2h8.2L17 7" />,
  offline: (
    <>
      <path d="m3.5 3.5 17 17" />
      <path d="M8.6 8.4A9.4 9.4 0 0 0 3.2 11M5.9 14.2a6 6 0 0 1 3-1.7M16.2 11.2A9.4 9.4 0 0 1 20.8 11M12.6 14.1a4 4 0 0 1 2.6 1.5M12 19.2h.01" />
    </>
  ),
  sparkle: <path d="m12 3.2 1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.4" />
      <path d="M5.5 15V6.4a2 2 0 0 1 2-2H15" />
    </>
  ),
  'arrow-ul': <path d="M17 17 7 7M7 15V7h8" />,
  check: <path d="m5 12.6 4.4 4.4L19 7.4" />,
  shuffle: (
    <>
      <path d="M4 7.5h3c4 0 5 9 9 9h4M4 16.5h3c1.4 0 2.4-1.2 3.2-2.8M13.4 9.6c.8-1.3 1.7-2.1 2.9-2.1H20" />
      <path d="m17.6 5-2.6 2.5 2.6 2.5M17.6 14l2.6 2.5-2.6 2.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.3.2-2.5 1.6-2.5H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5z" />
      <circle cx="8" cy="11" r="1" />
      <circle cx="12" cy="7.5" r="1" />
      <circle cx="16" cy="11" r="1" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </>
  ),
  book: <path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10" />,
};

interface IconProps {
  name: IconName;
  size?: number;
  filled?: boolean;
  class?: string;
}

export function Icon({ name, size = 22, filled = false, class: className }: IconProps) {
  return (
    <svg
      class={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Знак приложения: два диалоговых облака (язык ↔ язык). */
/** Фирменная «D» DataLaw DesignLab; цвет задаёт тема (CSS-маска по public/logo-mask.png). */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      class="logo"
      role="img"
      aria-label="DataLaw DesignLab"
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  );
}
