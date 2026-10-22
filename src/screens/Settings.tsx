import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon, LogoMark } from '../components/Icon.tsx';
import type { IconName } from '../components/Icon.tsx';
import { ProgressBar, Switch } from '../components/ui.tsx';
import { useResource } from '../hooks.ts';
import { t } from '../i18n.ts';
import type { StringKey } from '../i18n.ts';
import { loadMeta } from '../lib/data.ts';
import type { Progress } from '../lib/download.ts';
import { cacheCount, clearCache, fetchManifest, installPack, packInfo, removePack } from '../lib/pack.ts';
import type { PackInfo } from '../lib/pack.ts';
import { LOCALE } from '../lib/speech.ts';
import { tap } from '../native.ts';
import { say, saySerbian } from '../speakUi.ts';
import { settings, showToast, updateSettings, useStore } from '../store.ts';
import type { ScriptPref, ThemeMode, UiLang } from '../store.ts';

/* ───────────── Строительные блоки (как в Forma) ───────────── */

function Group({ title, children }: { title?: string; children: ComponentChildren }) {
  return (
    <section class="group">
      {title ? <h4 class="group__title">{title}</h4> : null}
      <div class="group-box">{children}</div>
    </section>
  );
}

function Row({ title, sub, children }: { title: string; sub?: string; children?: ComponentChildren }) {
  return (
    <div class="set-row">
      <div class="set-txt">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="fseg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          class={o.value === value ? 'on' : ''}
          onClick={() => {
            tap();
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const mb = (bytes: number) => Math.max(1, Math.round(bytes / 1048576));

function DataSection() {
  const s = useStore(settings);
  const meta = useResource('meta', loadMeta);
  const m = meta.data;
  const fmt = (n: number) => n.toLocaleString(s.uiLang === 'ru' ? 'ru-RU' : 'en-US');

  const [info, setInfo] = useState<PackInfo | null>(null);
  const [remote, setRemote] = useState<{ version: string; total: number } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [cached, setCached] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const busy = progress !== null;

  const refresh = async () => {
    setInfo(await packInfo());
    setCached(await cacheCount());
    try {
      const man = await fetchManifest();
      setRemote({ version: man.version, total: man.total });
    } catch {
      setRemote(null); // нет сети — просто не знаем размер
    }
  };
  useEffect(() => {
    void refresh();
    return () => ctrl.current?.abort();
  }, []);

  const download = async () => {
    tap();
    const c = new AbortController();
    ctrl.current = c;
    setProgress({ files: 0, totalFiles: 1, bytes: 0, totalBytes: remote?.total ?? 1 });
    try {
      await installPack(setProgress, c.signal);
      showToast(t('toastDownloaded'));
    } catch (e) {
      showToast(e instanceof DOMException && e.name === 'AbortError' ? t('toastDownloadCancelled') : t('toastDownloadFailed'));
    } finally {
      ctrl.current = null;
      setProgress(null);
      await refresh();
    }
  };

  const remove = async () => {
    if (!window.confirm(t('dataRemoveConfirm'))) return;
    await removePack();
    showToast(t('toastRemovedPack'));
    await refresh();
  };

  const wipeCache = async () => {
    await clearCache();
    showToast(t('toastCacheCleared'));
    setCached(await cacheCount());
  };

  const installed = info?.installed === true;
  const hasUpdate = installed && remote !== null && remote.version !== info?.version;
  const size = remote?.total ?? info?.bytes;

  return (
    <>
      <Group title={t('setData')}>
        <div class="pad datastate">
          <div class="datastate__head">
            <Icon name="offline" size={20} />
            <span>{installed ? t('dataModeOffline') : t('dataModeOnline')}</span>
            {hasUpdate ? <span class="badge">{t('dataUpdate')}</span> : null}
          </div>
          <p class="note note--flush">{installed ? t('dataModeOfflineBody') : t('dataModeOnlineBody')}</p>
          {m ? (
            <p class="note note--flush">
              {t('dataInfo', { words: fmt(m.words), forms: fmt(m.forms), ru: fmt(m.ruTerms), sent: fmt(m.sentences) })}
              {' · '}
              {t('dataBuilt', { date: (info?.version ?? m.built).slice(0, 10) })}
            </p>
          ) : null}

          {busy ? (
            <>
              <ProgressBar value={progress.totalBytes > 0 ? progress.bytes / progress.totalBytes : 0} label={t('dataCancel')} />
              <p class="note note--flush">{t('dataDownloading', { done: String(mb(progress.bytes)), total: String(mb(progress.totalBytes)) })}</p>
              <button type="button" class="btn ghost wide" onClick={() => ctrl.current?.abort()}>
                {t('dataCancel')}
              </button>
            </>
          ) : !installed || hasUpdate ? (
            <button type="button" class="btn primary wide" onClick={() => void download()} disabled={!installed && remote === null}>
              <Icon name="data" size={18} />
              {hasUpdate ? t('dataUpdateAction') : size ? t('dataDownloadSize', { mb: String(mb(size)) }) : t('dataDownload')}
            </button>
          ) : (
            <p class="note note--flush">{t('dataUpToDate')}</p>
          )}
        </div>
      </Group>

      {installed && !busy ? (
        <Group>
          <div class="pad col">
            <button type="button" class="btn ghost wide danger-t" onClick={() => void remove()}>
              <Icon name="trash" size={18} />
              {t('dataRemove')}
            </button>
          </div>
        </Group>
      ) : null}

      {!installed && cached > 0 ? (
        <Group>
          <Row title={t('dataCache', { n: fmt(cached) })}>
            <button type="button" class="btn ghost sm-btn" onClick={() => void wipeCache()}>
              {t('dataCacheClear')}
            </button>
          </Row>
        </Group>
      ) : null}
    </>
  );
}


/* ───────────── Подэкраны ───────────── */

const THEMES: ReadonlyArray<{ value: ThemeMode; label: StringKey }> = [
  { value: 'auto', label: 'themeAuto' },
  { value: 'light', label: 'themeLight' },
  { value: 'amoled', label: 'themeAmoled' },
];

function PageLook() {
  const s = useStore(settings);
  return (
    <>
      <Group title={t('setTheme')}>
        <div class="pad">
          <Seg<ThemeMode>
            label={t('setTheme')}
            value={s.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={THEMES.map((th) => ({ value: th.value, label: t(th.label) }))}
          />
        </div>
        <div class="theme-row">
          <button type="button" class="theme-prev tp-dark" onClick={() => updateSettings({ theme: 'amoled' })} aria-label={t('themeAmoled')}>
            <i />
            <i />
            <i />
            <span>{t('themeAmoledName')}</span>
          </button>
          <button type="button" class="theme-prev tp-light" onClick={() => updateSettings({ theme: 'light' })} aria-label={t('themeLight')}>
            <i />
            <i />
            <i />
            <span>{t('themeLightName')}</span>
          </button>
        </div>
      </Group>
      <Group title={t('setBehavior')}>
        <Row title={t('setHaptics')} sub={t('setHapticsHint')}>
          <Switch checked={s.haptics} onChange={(haptics) => updateSettings({ haptics })} label={t('setHaptics')} />
        </Row>
        <Row title={t('setOfflineHint')}>
          <Switch checked={s.offlineHint} onChange={(offlineHint) => updateSettings({ offlineHint })} label={t('setOfflineHint')} />
        </Row>
      </Group>
    </>
  );
}

function PageLang() {
  const s = useStore(settings);
  return (
    <>
      <Group title={t('setLanguage')}>
        <Row title={t('setUiLang')} sub={t('setUiLangHint')}>
          <Seg<UiLang>
            label={t('setUiLang')}
            value={s.uiLang}
            onChange={(uiLang) => updateSettings({ uiLang })}
            options={[
              { value: 'ru', label: 'RU' },
              { value: 'en', label: 'EN' },
            ]}
          />
        </Row>
        <Row title={t('setScript')} sub={t('setScriptHint')}>
          <Seg<ScriptPref>
            label={t('setScript')}
            value={s.script}
            onChange={(script) => updateSettings({ script })}
            options={[
              { value: 'lat', label: t('scriptLat') },
              { value: 'cyr', label: t('scriptCyr') },
            ]}
          />
        </Row>
      </Group>
      <Group title={t('setPronunciation')}>
        <div class="pad col">
          <button type="button" class="btn ghost wide" onClick={() => void saySerbian('Zdravo, rečniče')}>
            <Icon name="volume" size={18} />
            {t('setTestSr')}
          </button>
          <button type="button" class="btn ghost wide" onClick={() => void say('Привет, словарь', LOCALE.ru)}>
            <Icon name="volume" size={18} />
            {t('setTestRu')}
          </button>
        </div>
      </Group>
      <p class="note">{t('setTtsNote')}</p>
    </>
  );
}

function PageSources() {
  return (
    <>
      <Group title={t('aboutSources')}>
        <Row title="Wiktionary · kaikki.org" sub={t('aboutWikt')} />
        <Row title="wordfreq" sub={t('aboutFreq')} />
        <Row title="Tatoeba" sub={t('aboutTat')} />
      </Group>
      <p class="note">{t('aboutLicenseNote')}</p>
      <Group title={t('aboutQualityTitle')}>
        <div class="pad">
          <p class="note note--flush">{t('aboutQuality')}</p>
        </div>
      </Group>
      <Group title={t('aboutPrivacyTitle')}>
        <div class="pad">
          <p class="note note--flush">{t('aboutPrivacy')}</p>
        </div>
      </Group>
    </>
  );
}

function PageAbout() {
  return (
    <div class="about">
      <div class="frame">
        <span class="corner tl" />
        <span class="corner tr" />
        <span class="corner bl" />
        <span class="corner br" />
        <div class="frame-in">
          <div class="logo-badge">
            <LogoMark size={60} />
          </div>
          <p class="eyebrow">{t('aboutMadeBy')}</p>
          <h2 class="brand">DataLaw DesignLab</h2>
          <div class="orn">
            <i />
            <b />
            <i />
          </div>
          <p class="made">{t('aboutMade')}</p>
          <span class="ver-pill">{t('setVersion', { v: __APP_VERSION__ })}</span>
        </div>
      </div>
      <p class="legal">{t('aboutLegal')}</p>
    </div>
  );
}

/* ───────────── Экран с горизонтальным пейджером ───────────── */

type PageId = 'look' | 'lang' | 'data' | 'sources' | 'about';

const PAGES: ReadonlyArray<{ id: PageId; icon: IconName; label: StringKey }> = [
  { id: 'look', icon: 'palette', label: 'setPageLook' },
  { id: 'lang', icon: 'translate', label: 'setPageLang' },
  { id: 'data', icon: 'data', label: 'setPageData' },
  { id: 'sources', icon: 'book', label: 'setPageSources' },
  { id: 'about', icon: 'info', label: 'setPageAbout' },
];

/** Какой подэкран открыт — помним между заходами; извне можно попросить открыть нужный. */
let remembered = 0;
export function openSettingsPage(id: PageId): void {
  remembered = Math.max(0, PAGES.findIndex((p) => p.id === id));
}

export function SettingsScreen() {
  useStore(settings);
  const [cur, setCur] = useState(remembered);
  const pager = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLElement>(null);
  const curRef = useRef(cur);
  curRef.current = cur;

  // при заходе — сразу на запомненный подэкран
  useEffect(() => {
    const el = pager.current;
    if (el) el.scrollTo({ left: remembered * el.clientWidth });
  }, []);

  // активная вкладка в полосе — в поле зрения
  useEffect(() => {
    remembered = cur;
    const b = tabs.current?.children[cur] as HTMLElement | undefined;
    if (b && tabs.current) tabs.current.scrollTo({ left: b.offsetLeft - 16, behavior: 'smooth' });
  }, [cur]);

  const raf = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = pager.current;
      if (!el) return;
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (i !== curRef.current && i >= 0 && i < PAGES.length) {
        setCur(i);
        tap();
      }
    });
  };

  const goTo = (i: number) => {
    const el = pager.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  const content = [<PageLook />, <PageLang />, <DataSection />, <PageSources />, <PageAbout />];

  return (
    <div class="settings-view">
      <header class="page-head">
        <div>
          <h1>{t('settingsTitle')}</h1>
          <p class="sub">{t('settingsSub')}</p>
        </div>
      </header>
      <nav class="set-tabs" role="tablist" ref={tabs}>
        {PAGES.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={i === cur}
            class={i === cur ? 'set-tab on' : 'set-tab'}
            onClick={() => goTo(i)}
          >
            <Icon name={p.icon} size={18} />
            {t(p.label)}
          </button>
        ))}
      </nav>
      <div class="pager" ref={pager} onScroll={onScroll}>
        {PAGES.map((p, i) => (
          <section key={p.id} class="page" role="tabpanel" aria-label={t(p.label)}>
            <div class="page-in">{content[i]}</div>
          </section>
        ))}
      </div>
      <div class="dots" aria-hidden="true">
        {PAGES.map((p, i) => (
          <i key={p.id} class={i === cur ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}
