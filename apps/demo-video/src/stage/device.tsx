import type { CSSProperties, ReactNode } from 'react'

/** The tablet's screen in CSS pixels. */
export const SCREEN_WIDTH = 1024
export const SCREEN_HEIGHT = 768

export const BEZEL = 24

/** A plain tablet: dark bezel, rounded screen in the Clay theme. */
export function Device({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: SCREEN_WIDTH + BEZEL * 2,
        height: SCREEN_HEIGHT + BEZEL * 2,
        padding: BEZEL,
        borderRadius: 58,
        background: 'linear-gradient(160deg, #2c2926 0%, #191715 100%)',
        boxShadow:
          'inset 0 0 0 1.5px rgba(255,255,255,0.08), 0 50px 90px -30px rgba(60,42,30,0.45), 0 18px 36px -18px rgba(60,42,30,0.35)',
        ...style,
      }}
    >
      <div
        data-theme="clay"
        style={{
          position: 'relative',
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          borderRadius: 34,
          overflow: 'hidden',
          background: 'var(--bg)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
