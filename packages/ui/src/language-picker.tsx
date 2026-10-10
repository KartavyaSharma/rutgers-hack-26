'use client'

import { useId, useState } from 'react'
import { Button } from './button'
import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'

export interface LanguageOption {
  value: string
  /** The English name, shown bold, e.g. "Spanish". */
  name: string
  /** The language's own name, under it, e.g. "Español". */
  nativeName: string
  /** BCP-47 code of the native name, so screen readers pronounce it right. */
  lang?: string
  /** Text direction of the native name: "rtl" for Arabic, Hebrew, Persian, Urdu. */
  dir?: 'ltr' | 'rtl'
}

const fold = (text: string) => text.toLocaleLowerCase()

/** Prefix match on the English or the native name, as on the board. */
const matches = (option: LanguageOption, query: string) =>
  fold(option.name).startsWith(query) || fold(option.nativeName).startsWith(query)

const byName = (a: LanguageOption, b: LanguageOption) => a.name.localeCompare(b.name)

function LanguageTile({
  option,
  selected,
  onSelect,
}: {
  option: LanguageOption
  selected: boolean
  onSelect: () => void
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: big tiles in a grid, announced as radios
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-[76px] items-center justify-between gap-2.5 rounded-sm border-[3px] px-5 py-1.5 text-left text-ink',
        selected ? 'border-action-ink bg-action-tint' : 'border-transparent bg-surface',
        pressable,
        focusRing,
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-label leading-tight font-bold">{option.name}</span>
        <span lang={option.lang} dir={option.dir} className="truncate text-body text-muted">
          {option.nativeName}
        </span>
      </span>
      {selected ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-action text-on-action">
          <Icon name="check" className="size-5" strokeWidth={3} />
          <span className="sr-only">Selected</span>
        </span>
      ) : null}
    </button>
  )
}

const sectionHeading =
  'col-span-full font-body text-body font-bold tracking-[0.06em] text-muted uppercase'

function TileGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly LanguageOption[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="col-span-full grid grid-cols-4 gap-2.5">
      {options.map((option) => (
        <LanguageTile
          key={option.value}
          option={option}
          selected={option.value === value}
          onSelect={() => onChange(option.value)}
        />
      ))}
    </div>
  )
}

export interface LanguagePickerProps {
  /** Every language; shown A to Z by English name. */
  options: readonly LanguageOption[]
  /** The "Most used" tiles, in order (e.g. Auto first). */
  mostUsed: readonly LanguageOption[]
  value: string
  onChange: (value: string) => void
  onContinue: () => void
  /** Continue, in the chosen language. */
  continueLabel?: string
  /** Language and direction of the Continue label. */
  continueLang?: string
  continueDir?: 'ltr' | 'rtl'
  title?: string
  /** "Choose your language" in other languages. */
  subtitle?: string
  className?: string
}

/**
 * The full-screen language screen (first run, and the header's Language button): a search box,
 * "Most used", then every language A to Z as a 4-column grid, and Continue.
 */
export function LanguagePicker({
  options,
  mostUsed,
  value,
  onChange,
  onContinue,
  continueLabel = 'Continue',
  continueLang,
  continueDir,
  title = 'Choose your language',
  subtitle,
  className,
}: LanguagePickerProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const q = fold(query.trim())
  const all = [...options].sort(byName)
  // Search covers everything shown, including Most used entries that are not in `options` (Auto).
  const searchable = [...mostUsed.filter((m) => !options.some((o) => o.value === m.value)), ...all]
  const found = q ? searchable.filter((option) => matches(option, q)).sort(byName) : []

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        'absolute inset-0 z-30 flex flex-col gap-[18px] bg-bg px-9 py-7 text-ink',
        className,
      )}
    >
      <header className="flex items-center gap-5">
        <span className="flex size-[76px] shrink-0 items-center justify-center rounded-pill bg-action text-on-action">
          <Icon name="globe" className="size-10" />
        </span>
        <span className="flex flex-col gap-1.5">
          <h2 id={`${id}-title`} className="font-heading text-display-lg leading-none">
            {title}
          </h2>
          {subtitle ? <span className="text-body text-muted">{subtitle}</span> : null}
        </span>
      </header>

      <label className="flex h-[76px] shrink-0 items-center gap-3.5 rounded-pill border-2 border-border bg-surface pr-2 pl-6 focus-within:border-action-ink">
        <Icon name="search" className="size-7 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for your language"
          aria-label="Search languages"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-label text-ink outline-none placeholder:text-muted"
        />
        {query ? (
          <Button
            variant="ghost"
            size="md"
            onClick={() => setQuery('')}
            className="bg-action-tint text-action-ink"
          >
            Clear
          </Button>
        ) : null}
      </label>

      <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-2.5 overflow-y-auto pr-1.5 [scrollbar-width:thin]">
        {q ? (
          found.length > 0 ? (
            <TileGroup label="Languages" options={found} value={value} onChange={onChange} />
          ) : (
            <p className="col-span-full px-4 py-6 text-lead text-muted" role="status">
              No match. Try saying it instead.
            </p>
          )
        ) : (
          <>
            <h3 className={cn(sectionHeading, 'pt-1')}>Most used</h3>
            <TileGroup label="Most used" options={mostUsed} value={value} onChange={onChange} />
            <h3 className={cn(sectionHeading, 'pt-3.5')}>All languages, A to Z</h3>
            <TileGroup label="All languages" options={all} value={value} onChange={onChange} />
          </>
        )}
      </div>

      <Button variant="primary" size="xl" onClick={onContinue} className="w-full">
        <span lang={continueLang} dir={continueDir}>
          {continueLabel}
        </span>
      </Button>
    </section>
  )
}
