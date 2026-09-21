// src/i18n/LanguageContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getMeta, setMeta } from '../db/metaRepo';
import type { SupportedLanguage, Translations } from './types';
import { en } from './translations/en';
import { zh } from './translations/zh';
import { getCategoryLabel } from './categories';
import type { Category } from '../lib/types';
import { ISO_DATE_RE, isValidIsoDate } from '../lib/dates';

const APP_LANGUAGE_KEY = 'app_language';

const DICTIONARIES: Record<SupportedLanguage, Translations> = {
  en,
  zh,
};

const ZH_MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ZH_WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface LanguageCtx {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  isZh: boolean;
  translations: Translations;
  t: (key: keyof Translations | string, params?: Record<string, string | number>) => string;
  tCat: (cat: Category | { id: string; label: string; isDefault?: boolean } | null | undefined) => string;
  formatGreeting: (d?: Date) => string;
  formatMonthLabel: (monthKey: string, full?: boolean) => string;
  formatLongDate: (d?: Date) => string;
  formatShortDate: (iso?: string | null) => string;
  formatFullDate: (iso?: string | null) => string;
  formatFullDateWithWeekday: (iso?: string | null) => string;
  formatCadence: (cadence: string) => string;
  formatMotion: (setting: string) => string;
}

export function translate(
  lang: SupportedLanguage,
  key: keyof Translations | string,
  params?: Record<string, string | number>
): string {
  const dict = (DICTIONARIES[lang] || en) as unknown as Record<string, string>;
  const enDict = en as unknown as Record<string, string>;
  let text = dict[key] ?? enDict[key] ?? key;

  if (params) {
    for (const [pKey, pVal] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pVal));
    }
    // Handle {plural} interpolation for count if present
    if ('count' in params && typeof params.count === 'number') {
      const pluralStr = params.count === 1 ? '' : 's';
      text = text.replace(/\{plural\}/g, pluralStr);
    }
  }
  return text;
}

const defaultCtx: LanguageCtx = {
  language: 'en',
  setLanguage: () => {},
  isZh: false,
  translations: en,
  t: (key, params) => translate('en', key, params),
  tCat: (cat) => getCategoryLabel(cat, 'en'),
  formatGreeting: () => 'Good day',
  formatMonthLabel: (m) => m,
  formatLongDate: () => '',
  formatShortDate: (s) => s ?? '',
  formatFullDate: (s) => s ?? '',
  formatFullDateWithWeekday: (s) => s ?? '',
  formatCadence: (c) => c,
  formatMotion: (m) => m,
};

const Ctx = createContext<LanguageCtx>(defaultCtx);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en');

  useEffect(() => {
    getMeta(APP_LANGUAGE_KEY).then((saved) => {
      if (saved === 'en' || saved === 'zh') {
        setLanguageState(saved);
      }
    });
  }, []);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    void setMeta(APP_LANGUAGE_KEY, lang);
  };

  const value = useMemo<LanguageCtx>(() => {
    const isZh = language === 'zh';

    const t = (key: keyof Translations | string, params?: Record<string, string | number>) => {
      return translate(language, key, params);
    };

    const tCat = (cat: Category | { id: string; label: string; isDefault?: boolean } | null | undefined) => {
      return getCategoryLabel(cat, language);
    };

    const formatGreeting = (d: Date = new Date()): string => {
      const h = d.getHours();
      if (h >= 6 && h < 12) return t('greetingMorning');
      if (h >= 12 && h < 18) return t('greetingAfternoon');
      return t('greetingEvening');
    };

    const formatMonthLabel = (monthKey: string, full = true): string => {
      const m = monthKey.match(/^(\d{4})-(\d{2})$/);
      if (!m) return monthKey;
      const year = m[1];
      const idx = parseInt(m[2], 10) - 1;
      if (idx < 0 || idx > 11) return monthKey;
      if (isZh) {
        return `${year}年${idx + 1}月`;
      }
      return full ? `${EN_MONTHS[idx]} ${year}` : `${EN_MONTHS_SHORT[idx]} '${year.slice(2)}`;
    };

    const formatLongDate = (d: Date = new Date()): string => {
      if (isZh) {
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${ZH_WEEKDAYS[d.getDay()]}`;
      }
      return `${EN_WEEKDAYS[d.getDay()]} · ${d.getDate()} ${EN_MONTHS[d.getMonth()]}`;
    };

    const formatShortDate = (iso?: string | null): string => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      if (isZh) {
        return `${d.getMonth() + 1}月${d.getDate()}日`;
      }
      return `${d.getDate()} ${EN_MONTHS_SHORT[d.getMonth()]}`;
    };

    const formatFullDate = (iso?: string | null): string => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      if (isZh) {
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
      }
      return `${d.getDate()} ${EN_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
    };

    const formatFullDateWithWeekday = (iso?: string | null): string => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      if (isZh) {
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${ZH_WEEKDAYS[d.getDay()]}`;
      }
      return `${EN_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${EN_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
    };

    const formatCadence = (cadence: string): string => {
      if (cadence === 'daily') return t('cadenceDaily');
      if (cadence === 'weekly') return t('cadenceWeekly');
      return t('off');
    };

    const formatMotion = (setting: string): string => {
      if (setting === 'full') return t('motionFull');
      if (setting === 'reduced') return t('motionReduced');
      return t('motionOff');
    };

    return {
      language,
      setLanguage,
      isZh,
      translations: DICTIONARIES[language] || en,
      t,
      tCat,
      formatGreeting,
      formatMonthLabel,
      formatLongDate,
      formatShortDate,
      formatFullDate,
      formatFullDateWithWeekday,
      formatCadence,
      formatMotion,
    };
  }, [language]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLanguage(): LanguageCtx {
  return useContext(Ctx);
}
