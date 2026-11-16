import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { uk, type MessageKey } from './uk';
import { en } from './en';

export type Lang = 'uk' | 'en';
const dicts: Record<Lang, Record<MessageKey, string>> = { uk, en };
const STORAGE_KEY = 'schdk.lang';

export type Params = Record<string, string | number>;
export type T = (key: MessageKey | string, params?: Params) => string;

export function translate(lang: Lang, key: string, params?: Params): string {
  const msg = (dicts[lang] as Record<string, string>)[key] ?? (uk as Record<string, string>)[key] ?? key;
  if (!params) return msg;
  return msg.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
}
const I18nContext = createContext<Ctx | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'uk' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'uk';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = useCallback<T>((key, params) => translate(lang, key, params), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
