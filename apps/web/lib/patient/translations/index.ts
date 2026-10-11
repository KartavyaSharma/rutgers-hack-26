// Screen words written by hand, one table per language, keyed by the English string. Every
// other language is translated live by /api/ui-text/[language] (lib/server/ui-text.ts).
// zh.json's keys are the full list of tablet strings: add new ones to every table here.
export const TRANSLATIONS: Readonly<
  Record<string, () => Promise<{ default: Readonly<Record<string, string>> }>>
> = {
  es: () => import('./es.json'),
  hi: () => import('./hi.json'),
  zh: () => import('./zh.json'),
}
