import { DEFAULT_ROOM_SETTINGS } from '@bell/core/taxonomy'
import type { Metadata, Viewport } from 'next'
import { Atkinson_Hyperlegible, DM_Serif_Display, Fraunces } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

// Clay: DM Serif Display headings, Atkinson Hyperlegible for everything else.
// Fraunces is the Night theme's heading face (shown on /design; night is for later).
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-atkinson',
  display: 'swap',
})

const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dm-serif-display',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-fraunces',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Bell', template: '%s · Bell' },
  description: 'A bedside call bell that sends each request to the right hospital team.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme is fixed to Clay for now (no picker on the tablet).
    <html
      lang="en"
      data-theme={DEFAULT_ROOM_SETTINGS.theme}
      className={`${atkinson.variable} ${dmSerifDisplay.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
