'use client'

import type { KaldiRecognizer, Model } from 'vosk-browser'
import { useEffect, useRef } from 'react'

/** Small English Vosk model, served from public/. Recognition runs in the browser. */
const MODEL_URL = '/models/hey-bell-en.tar.gz'
/** Only these words can come out, so anything else reads as "[unk]". */
const GRAMMAR = JSON.stringify(['hey bell', '[unk]'])
const WAKE = /\bhey bell\b/

let modelPromise: Promise<Model> | null = null
const loadModel = () => {
  modelPromise ??= import('vosk-browser').then(({ createModel }) => createModel(MODEL_URL, -1))
  modelPromise.catch(() => {
    modelPromise = null
  })
  return modelPromise
}

interface Options {
  /** Listen only while true (voice is set up and no voice session is running). */
  active: boolean
  onWake: () => void
}

/**
 * Watches the mic for "Hey Bell" on the tablet itself; no audio leaves the device until the
 * phrase is heard. The mic is released whenever `active` is false.
 */
export const useWakePhrase = ({ active, onWake }: Options) => {
  const onWakeRef = useRef(onWake)
  onWakeRef.current = onWake

  useEffect(() => {
    if (!active) return
    let stopped = false
    let fired = false
    let stream: MediaStream | null = null
    let audio: AudioContext | null = null
    let recognizer: KaldiRecognizer | null = null
    const resume = () => void audio?.resume()

    const heard = (text: string | undefined) => {
      if (fired || stopped || !text || !WAKE.test(text)) return
      fired = true
      onWakeRef.current()
    }

    const run = async () => {
      const model = await loadModel()
      if (stopped) return
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      if (stopped) return
      audio = new AudioContext()
      // Browsers keep audio suspended until the first touch on the page.
      if (audio.state === 'suspended') window.addEventListener('pointerdown', resume, { once: true })
      const rec = new model.KaldiRecognizer(audio.sampleRate, GRAMMAR)
      recognizer = rec
      rec.on('partialresult', (m) => 'result' in m && heard((m.result as { partial?: string }).partial))
      rec.on('result', (m) => 'result' in m && heard((m.result as { text?: string }).text))
      const source = audio.createMediaStreamSource(stream)
      const processor = audio.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (event) => {
        if (!stopped) rec.acceptWaveform(event.inputBuffer)
      }
      source.connect(processor)
      processor.connect(audio.destination)
    }

    run().catch((error) => console.warn('Hey Bell listening is off:', error))

    return () => {
      stopped = true
      window.removeEventListener('pointerdown', resume)
      recognizer?.remove()
      for (const track of stream?.getTracks() ?? []) track.stop()
      void audio?.close()
    }
  }, [active])
}
