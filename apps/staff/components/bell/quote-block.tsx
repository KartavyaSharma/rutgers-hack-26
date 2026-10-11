'use client'

import { cn } from 'cn'
import { useState } from 'react'

/** The patient's words in their own language, when Bell translated them for the nurse. */
export interface OriginalWords {
  /** "Chinese" */
  language: string
  words: string
  /** False: Bell could not translate, so `words` above is already the original. */
  translated: boolean
}

/**
 * The patient's own words, with how and when they asked, e.g. "By voice · 22 min ago".
 * Asked in another language: "Translated from Chinese" and a link to see the original.
 */
export function QuoteBlock({
  words,
  meta,
  original,
  size = 'lg',
  className,
}: {
  words: string
  meta?: string
  original?: OriginalWords
  /** lg: the big quote at the top of a request. sm: a quote inside a list or panel. */
  size?: 'sm' | 'lg'
  className?: string
}) {
  const [showOriginal, setShowOriginal] = useState(false)
  const lg = size === 'lg'
  const translated = original?.translated === true
  const lead = original
    ? translated
      ? `Translated from ${original.language}`
      : `In ${original.language}, Bell could not translate it`
    : null
  const caption = [lead, meta].filter(Boolean).join(' · ')
  return (
    <figure
      className={cn(
        'm-0 flex flex-col gap-1 bg-background',
        lg ? 'gap-1.5 rounded-xl px-5 py-4' : 'rounded-[10px] px-3.5 py-3',
        className,
      )}
    >
      <blockquote
        className={cn('m-0 font-semibold leading-[1.35]', lg ? 'text-xl' : 'text-[15px]')}
      >
        “{words}”
      </blockquote>
      {caption ? (
        <figcaption className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink-soft">
          <span>{caption}</span>
          {translated ? (
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              aria-expanded={showOriginal}
              className="cursor-pointer font-semibold text-foreground underline-offset-2 hover:underline"
            >
              {showOriginal ? 'Hide original' : 'See original'}
            </button>
          ) : null}
        </figcaption>
      ) : null}
      {translated && showOriginal && original ? (
        <p
          className={cn(
            'm-0 border-border border-t pt-2 text-ink-strong leading-[1.4]',
            lg ? 'mt-1 text-base' : 'text-sm',
          )}
        >
          “{original.words}”
        </p>
      ) : null}
    </figure>
  )
}
