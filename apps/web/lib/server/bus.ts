import { EventEmitter } from 'node:events'
import type { StreamEvent } from '@bell/core/taxonomy'

// In-process event bus. Lives on globalThis so every route module (and dev HMR
// reloads) share one emitter. Fine for a single web instance.
const globalForBus = globalThis as typeof globalThis & { __bellBus?: EventEmitter }

const bus = (): EventEmitter => {
  if (!globalForBus.__bellBus) {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(0)
    globalForBus.__bellBus = emitter
  }
  return globalForBus.__bellBus
}

const EVENT = 'stream-event'

export const publish = (event: StreamEvent): void => {
  bus().emit(EVENT, event)
}

export const subscribe = (listener: (event: StreamEvent) => void): (() => void) => {
  // A throwing listener must not break delivery to the others.
  const safe = (event: StreamEvent) => {
    try {
      listener(event)
    } catch (error) {
      console.error('[bus] listener failed', error)
    }
  }
  bus().on(EVENT, safe)
  return () => {
    bus().off(EVENT, safe)
  }
}

/** Number of open subscriptions (one per connected SSE client). */
export const subscriberCount = (): number => bus().listenerCount(EVENT)
