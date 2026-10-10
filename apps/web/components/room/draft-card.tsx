'use client'

import { patientMessage, quotePatientWords } from '@bell/core/messages'
import type { LanguagePreference, RequestDraft } from '@bell/core/taxonomy'
import { Icon, RoomButton } from '@bell/ui'
import { useId } from 'react'

interface DraftCardProps {
  draft: RequestDraft
  /** Language for the fixed words ("Not sent yet", the prompt). */
  language: LanguagePreference | string
  busy: boolean
  onSend: () => void
  onCancel: () => void
}

/**
 * A typed or spoken request waiting for the patient's OK. Nothing has reached anyone yet,
 * so "Not sent yet" stays on screen until they tap Send (or say yes to the voice helper).
 * Deliberately plain: the final look comes from the design canvas.
 */
export function DraftCard({ draft, language, busy, onSend, onCancel }: DraftCardProps) {
  const id = useId()
  return (
    <section
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-status`}
      className="flex items-center gap-4 rounded-lg border-2 border-border-strong bg-surface p-4"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          id={`${id}-status`}
          className="self-start rounded-sm bg-warn-tint px-3 py-0.5 text-body font-bold text-warn-ink"
        >
          {patientMessage('not_sent', language)}
        </p>
        <h2 id={`${id}-title`} className="line-clamp-2 font-body text-lead font-bold text-ink">
          {draft.patientText || quotePatientWords(draft.text, language)}
        </h2>
        {draft.source === 'voice' ? (
          <p className="text-body text-muted">{patientMessage('confirm_prompt', language)}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <RoomButton type="button" variant="ghost" size="lg" disabled={busy} onClick={onCancel}>
          Cancel
        </RoomButton>
        <RoomButton
          type="button"
          variant="primary"
          size="lg"
          disabled={busy}
          aria-busy={busy}
          onClick={onSend}
        >
          <Icon name="send" />
          Send
        </RoomButton>
      </div>
    </section>
  )
}
