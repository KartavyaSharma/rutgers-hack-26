import { useId } from 'react'
import { Button } from './button'
import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'

export interface LanguageOption {
  value: string
  /** The language's own name, e.g. "Español". */
  label: string
  /** The English name, e.g. "Spanish". */
  sublabel?: string
  /** BCP-47 code for the label's text, so screen readers pronounce it right. */
  lang?: string
  /** Text direction of the label: "rtl" for Arabic. */
  dir?: 'ltr' | 'rtl'
}

export interface LanguageOptionsProps {
  options: readonly LanguageOption[]
  value: string
  onChange: (value: string) => void
  /** 2 for the Language sheet, 3 for the first-run screen. */
  columns?: 2 | 3
  /** Stretch the grid rows to fill the height (first-run screen). */
  fill?: boolean
  className?: string
  'aria-label'?: string
}

/** A grid of language buttons; one is selected (radio semantics). */
export function LanguageOptions({
  options,
  value,
  onChange,
  columns = 2,
  fill = false,
  className,
  'aria-label': ariaLabel = 'Language',
}: LanguageOptionsProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'grid gap-3',
        columns === 3 ? 'grid-cols-3' : 'grid-cols-2',
        fill && 'auto-rows-fr',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          // biome-ignore lint/a11y/useSemanticElements: a grid of big buttons, announced as radios
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-tap-xl items-center justify-between gap-2.5 rounded-md border-[3px] px-5 py-2 text-left text-ink',
              selected ? 'border-action-ink bg-action-tint' : 'border-transparent bg-surface',
              pressable,
              focusRing,
            )}
          >
            <span className="flex flex-col gap-0.5">
              <span
                lang={option.lang}
                dir={option.dir}
                className="text-title leading-tight font-bold"
              >
                {option.label}
              </span>
              {option.sublabel ? (
                <span className="text-body text-muted">{option.sublabel}</span>
              ) : null}
            </span>
            {selected ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-action text-on-action">
                <Icon name="check" className="size-[22px]" strokeWidth={3} />
                <span className="sr-only">Selected</span>
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export interface LanguagePickerProps {
  /** The languages, shown as a 3 × 4 grid (the board's 12). */
  options: readonly LanguageOption[]
  /** Optional "Auto (detect)" choice, shown beside Continue (value e.g. "auto"). */
  autoOption?: LanguageOption
  value: string
  onChange: (value: string) => void
  onContinue: () => void
  /** Continue, in the chosen language. */
  continueLabel?: string
  /** Language and direction of the Continue label (e.g. "ar" and "rtl"). */
  continueLang?: string
  continueDir?: 'ltr' | 'rtl'
  title?: string
  /** "Choose your language" in a few other languages. */
  subtitle?: string
  className?: string
}

/** Full-screen first-run language choice. */
export function LanguagePicker({
  options,
  autoOption,
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
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        'absolute inset-0 z-30 flex flex-col gap-5 bg-bg px-9 py-8 text-ink',
        className,
      )}
    >
      <header className="flex items-center gap-5">
        <span className="flex size-disc-lg shrink-0 items-center justify-center rounded-pill bg-action text-on-action">
          <Icon name="globe" className="size-10" />
        </span>
        <span className="flex flex-col gap-1.5">
          <h2 id={`${id}-title`} className="font-heading text-display-lg leading-none">
            {title}
          </h2>
          {subtitle ? <span className="text-body text-muted">{subtitle}</span> : null}
        </span>
      </header>
      <LanguageOptions
        options={options}
        value={value}
        onChange={onChange}
        columns={3}
        fill
        className="min-h-0 flex-1"
      />
      <div className="flex gap-3.5">
        {autoOption ? (
          <button
            type="button"
            aria-pressed={value === autoOption.value}
            onClick={() => onChange(autoOption.value)}
            className={cn(
              'flex min-h-tap-xl flex-1 items-center justify-center gap-3 rounded-pill border-2 px-6 font-body text-lead font-bold text-ink',
              value === autoOption.value
                ? 'border-action-ink bg-action-tint'
                : 'border-border bg-surface',
              pressable,
              focusRing,
            )}
          >
            <Icon
              name={value === autoOption.value ? 'check' : 'globe'}
              className="size-7 text-action-ink"
            />
            {autoOption.label}
            {autoOption.sublabel ? (
              <span className="font-normal text-muted">· {autoOption.sublabel}</span>
            ) : null}
          </button>
        ) : null}
        <Button variant="primary" size="xl" onClick={onContinue} className="flex-1">
          <span lang={continueLang} dir={continueDir}>
            {continueLabel}
          </span>
        </Button>
      </div>
    </section>
  )
}
