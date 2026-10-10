'use client'

import type { LanguagePreference } from '@bell/core/taxonomy'
import type { Participant, RemoteParticipant, RemoteTrack, Room } from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchVoiceToken } from '@/lib/client/api'

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'
export type VoiceMode = 'request' | 'emergency'

/** Hang up this long after the agent finishes a reply and nobody speaks. */
const IDLE_AFTER_REPLY_MS: Record<VoiceMode, number> = { request: 12_000, emergency: 60_000 }
/** Give up if the agent has not joined by then. */
const AGENT_JOIN_TIMEOUT_MS = 15_000
/** Hard cap on a single voice session. */
const MAX_SESSION_MS = 5 * 60_000

const AGENT_STATE_ATTRIBUTE = 'lk.agent.state'

const fromAgentState = (value: string | undefined): VoiceState | null => {
  switch (value) {
    case 'speaking':
      return 'speaking'
    case 'thinking':
      return 'thinking'
    case 'listening':
    case 'initializing':
    case 'idle':
      return 'listening'
    default:
      return null
  }
}

const describeError = (error: unknown): string => {
  if (error instanceof ApiError && error.code === 'voice_not_configured') {
    return "Voice isn't set up yet"
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'The microphone is blocked. Please press the help button if you need someone.'
  }
  return "Voice isn't working right now. Please try again, or press the help button."
}

export interface StartOptions {
  mode: VoiceMode
  /** The urgent request the emergency conversation adds notes to. */
  emergencyRequestId?: string
}

interface Options {
  roomId: string
  /** The room's language setting, passed to the agent with the dispatch. */
  language: LanguagePreference
  /** False when the server has no LiveKit keys. */
  enabled: boolean
}

/**
 * Tap-to-talk voice session with the LiveKit agent, in 'request' or 'emergency' mode.
 * start -> token -> connect -> mic on ('listening'); the agent's `lk.agent.state` attribute drives
 * 'thinking'/'speaking'; stop() hangs up; it also hangs up by itself a while after the agent's reply.
 */
export const useVoiceSession = ({ roomId, language, enabled }: Options) => {
  const [state, setState] = useState<VoiceState>('idle')
  const [mode, setMode] = useState<VoiceMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)

  const roomRef = useRef<Room | null>(null)
  const sessionRef = useRef(0)
  const timersRef = useRef<{
    idle?: ReturnType<typeof setTimeout>
    join?: ReturnType<typeof setTimeout>
    max?: ReturnType<typeof setTimeout>
  }>({})
  const audioElementsRef = useRef<HTMLMediaElement[]>([])

  const clearTimers = useCallback(() => {
    const timers = timersRef.current
    clearTimeout(timers.idle)
    clearTimeout(timers.join)
    clearTimeout(timers.max)
    timersRef.current = {}
  }, [])

  const stop = useCallback(async () => {
    sessionRef.current += 1
    clearTimers()
    const room = roomRef.current
    roomRef.current = null
    for (const el of audioElementsRef.current) el.remove()
    audioElementsRef.current = []
    setState('idle')
    setMode(null)
    if (room) await room.disconnect().catch(() => {})
  }, [clearTimers])

  const start = useCallback(
    async ({ mode: nextMode, emergencyRequestId }: StartOptions) => {
      if (roomRef.current) await stop()
      const session = ++sessionRef.current
      const isCurrent = () => sessionRef.current === session
      setError(null)
      setMode(nextMode)
      setState('connecting')

      try {
        const [{ Room, RoomEvent, Track }, token] = await Promise.all([
          import('livekit-client'),
          fetchVoiceToken({
            roomId,
            language,
            mode: nextMode,
            ...(emergencyRequestId ? { emergencyRequestId } : {}),
          }),
        ])
        if (!isCurrent()) return

        const room = new Room({ adaptiveStream: false, dynacast: false })
        roomRef.current = room

        let agentHasReplied = false
        let usesAgentAttributes = false
        // A failed connect also emits Disconnected; only a live session hangs up from that
        // event, otherwise the catch below reports the failure.
        let connected = false
        let current: VoiceState = 'connecting'
        const set = (next: VoiceState) => {
          if (!isCurrent()) return
          current = next
          setState(next)
        }

        const scheduleIdleHangup = () => {
          clearTimeout(timersRef.current.idle)
          timersRef.current.idle = setTimeout(() => {
            if (isCurrent()) void stop()
          }, IDLE_AFTER_REPLY_MS[nextMode])
        }
        const cancelIdleHangup = () => clearTimeout(timersRef.current.idle)

        const applyAgentState = (next: VoiceState) => {
          if (current === 'speaking' && next !== 'speaking') agentHasReplied = true
          set(next)
          if (next === 'listening' && agentHasReplied) scheduleIdleHangup()
          else cancelIdleHangup()
        }

        const onAgentJoined = (participant: Participant) => {
          clearTimeout(timersRef.current.join)
          const initial = fromAgentState(participant.attributes[AGENT_STATE_ATTRIBUTE])
          if (initial) {
            usesAgentAttributes = true
            applyAgentState(initial)
          }
        }

        room
          .on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
            if (participant.isAgent) onAgentJoined(participant)
          })
          .on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
            if (!participant.isAgent || !(AGENT_STATE_ATTRIBUTE in changed)) return
            const next = fromAgentState(changed[AGENT_STATE_ATTRIBUTE])
            if (!next) return
            usesAgentAttributes = true
            applyAgentState(next)
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
            // The patient talking again keeps the session open.
            if (speakers.some((p) => p.identity === room.localParticipant.identity)) {
              cancelIdleHangup()
            } else if (current === 'listening' && agentHasReplied) {
              scheduleIdleHangup()
            }
            // Fallback for agents that do not publish lk.agent.state.
            if (!usesAgentAttributes) {
              const agentSpeaking = speakers.some((p) => p.isAgent)
              if (agentSpeaking && current !== 'speaking') applyAgentState('speaking')
              if (!agentSpeaking && current === 'speaking') applyAgentState('listening')
            }
          })
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
            if (track.kind !== Track.Kind.Audio) return
            const el = track.attach()
            el.hidden = true
            document.body.appendChild(el)
            audioElementsRef.current.push(el)
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
            for (const el of track.detach()) {
              el.remove()
              audioElementsRef.current = audioElementsRef.current.filter((a) => a !== el)
            }
          })
          .on(RoomEvent.Disconnected, () => {
            if (connected && isCurrent()) void stop()
          })

        await room.connect(token.serverUrl, token.participantToken)
        connected = true
        if (!isCurrent()) {
          await room.disconnect()
          return
        }
        await room.startAudio().catch(() => {})
        await room.localParticipant.setMicrophoneEnabled(true)
        if (!isCurrent()) return
        set('listening')

        for (const participant of room.remoteParticipants.values()) {
          if (participant.isAgent) onAgentJoined(participant)
        }
        if (![...room.remoteParticipants.values()].some((p) => p.isAgent)) {
          timersRef.current.join = setTimeout(() => {
            if (!isCurrent()) return
            setError("The voice helper didn't answer. Please try again, or press the help button.")
            void stop()
          }, AGENT_JOIN_TIMEOUT_MS)
        }
        timersRef.current.max = setTimeout(() => {
          if (isCurrent()) void stop()
        }, MAX_SESSION_MS)
      } catch (err) {
        if (!isCurrent()) return
        if (err instanceof ApiError && err.code === 'voice_not_configured') setNotConfigured(true)
        console.error('[voice] could not start', err)
        setError(describeError(err))
        await stop()
      }
    },
    [roomId, language, stop],
  )

  // Hang up when the page goes away.
  useEffect(
    () => () => {
      void stop()
    },
    [stop],
  )

  return {
    state,
    /** The mode of the session that is connecting or open; null when idle. */
    mode,
    error,
    clearError: useCallback(() => setError(null), []),
    available: enabled && !notConfigured,
    start,
    stop,
  }
}
