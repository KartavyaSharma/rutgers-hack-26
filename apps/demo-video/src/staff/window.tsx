import type { CSSProperties, ReactNode } from 'react'
import { STAFF_HEIGHT, STAFF_WIDTH } from './staff-screen'

export const TITLE_BAR = 40

/** A plain desktop window: light title bar with the three dots, the staff app below. */
export function AppWindow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: STAFF_WIDTH,
        height: STAFF_HEIGHT + TITLE_BAR,
        borderRadius: 16,
        overflow: 'hidden',
        background: '#f6f3ee',
        boxShadow:
          '0 0 0 1px rgba(42,38,34,0.12), 0 50px 100px -30px rgba(60,42,30,0.42), 0 20px 40px -20px rgba(60,42,30,0.3)',
        ...style,
      }}
    >
      <div
        style={{
          height: TITLE_BAR,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 18px',
          background: '#ebe6df',
          borderBottom: '1px solid #ddd6cc',
        }}
      >
        {['#e96a5a', '#e5b54a', '#6cbc5d'].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: 13, background: c }} />
        ))}
        <span
          style={{
            flex: 1,
            textAlign: 'center',
            marginRight: 66,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            color: '#6b635a',
          }}
        >
          Bell · 4 West
        </span>
      </div>
      <div style={{ position: 'relative', width: STAFF_WIDTH, height: STAFF_HEIGHT }}>
        {children}
      </div>
    </div>
  )
}
