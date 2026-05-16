import type { ReportLanguage, UiLabels } from './types';
import { result } from './result';
import { nav } from './nav';
import { landing } from './landing';
import { input } from './input';
import { footer } from './footer';
import { history } from './history';
import { admin } from './admin';
import { system } from './system';
import { legal } from './legal';

export type { ReportLanguage, UiLabels, FaqItem } from './types';

const SECTIONS = [result, nav, landing, input, footer, history, admin, system, legal] as const;

type LocaleEntry = { readonly vi: string; readonly en: string } | { readonly vi: readonly import('./types').FaqItem[]; readonly en: readonly import('./types').FaqItem[] };

function buildLocale(locale: ReportLanguage): UiLabels {
  const labels: Record<string, unknown> = {};
  for (const section of SECTIONS) {
    for (const [key, value] of Object.entries(section)) {
      const entry = value as LocaleEntry;
      labels[key] = (entry as Record<ReportLanguage, unknown>)[locale];
    }
  }
  return labels as unknown as UiLabels;
}

export const UI_LABELS: Record<ReportLanguage, UiLabels> = {
  vi: buildLocale('vi'),
  en: buildLocale('en'),
};

/** Replace `{key}` placeholders in translated strings */
export function formatLabel(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    template
  );
}
