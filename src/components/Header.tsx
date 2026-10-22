import type { ComponentChildren } from 'preact';
import { t } from '../i18n.ts';
import { navigate } from '../router.ts';
import { Icon } from './Icon.tsx';

export function goBack(): void {
  if (window.history.length > 1) window.history.back();
  else navigate({ name: 'home' }, true);
}

interface HeaderProps {
  title?: string;
  back?: boolean;
  actions?: ComponentChildren;
}

export function Header({ title, back = false, actions }: HeaderProps) {
  return (
    <header class="topbar">
      {back ? (
        <button type="button" class="iconbtn" onClick={goBack} aria-label={t('back')}>
          <Icon name="back" />
        </button>
      ) : null}
      <h1 class="topbar__title">{title}</h1>
      <div class="topbar__actions">{actions}</div>
    </header>
  );
}
