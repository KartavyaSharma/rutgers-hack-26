'use client'

import { cn } from 'cn'
import { MicIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const bars = [10, 18, 12, 20, 8]

/** "Ask Bell anything or tell it what to do" with Speak and Send. Speak only shows a listening state for now. */
export function AskBellBar({
  onSubmit,
  placeholder = 'Ask Bell anything or tell it what to do',
  busy = false,
  className,
}: {
  onSubmit: (text: string) => void | Promise<void>
  placeholder?: string
  busy?: boolean
  className?: string
}) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  return (
    <form
      className={cn('flex items-center gap-2.5', className)}
      onSubmit={(e) => {
        e.preventDefault()
        const value = text.trim()
        if (!value || busy) return
        setListening(false)
        void Promise.resolve(onSubmit(value)).then(() => setText(''))
      }}
    >
      <div
        className={cn(
          'flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border-[1.5px] bg-card pr-1.5 pl-5 transition-colors',
          listening ? 'border-foreground' : 'border-input focus-within:border-ink-soft',
        )}
      >
        {listening ? (
          <span role="status" className="flex min-w-0 flex-1 items-center gap-2.5 text-[15px]">
            <span aria-hidden className="inline-flex items-center gap-[3px]">
              {bars.map((h, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: static decoration
                  key={i}
                  className="w-[3px] rounded-sm bg-foreground"
                  style={{ height: h }}
                />
              ))}
            </span>
            <span className="truncate">Listening…{text ? ` “${text}”` : ''}</span>
          </span>
        ) : (
          <input
            name="ask"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            autoComplete="off"
            className="h-10 min-w-0 flex-1 border-none bg-transparent text-[15px] text-foreground outline-none placeholder:text-faint"
          />
        )}
        <button
          type="button"
          onClick={() => setListening((v) => !v)}
          aria-label={listening ? 'Stop listening' : 'Speak to Bell'}
          aria-pressed={listening}
          className={cn(
            'inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
            listening
              ? 'border-foreground bg-foreground text-primary-foreground'
              : 'border-input bg-card text-foreground hover:bg-subtle',
          )}
        >
          {listening ? null : <MicIcon className="size-4" />}
          {listening ? 'Stop' : 'Speak'}
        </button>
      </div>
      <Button type="submit" disabled={busy} className="h-12 px-[22px]">
        {busy ? 'Sending…' : 'Send'}
      </Button>
    </form>
  )
}
