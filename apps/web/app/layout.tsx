import { DEFAULT_ROOM_SETTINGS } from '@bell/core/taxonomy'
import type { Metadata, Viewport } from 'next'
import { Atkinson_Hyperlegible } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

// One family for the whole product: Atkinson Hyperlegible. Headings are its Bold (700)
// with -0.01em tracking (tokens.css), in Clay and Night alike.
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-atkinson',
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
    <html lang="en" data-theme={DEFAULT_ROOM_SETTINGS.theme} className={atkinson.variable}>
      <body>{children}</body>
    </html>
  )
}
