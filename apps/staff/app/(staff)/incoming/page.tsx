import type { Metadata } from 'next'
import { IncomingScreen } from '@/components/incoming/incoming-screen'

export const metadata: Metadata = { title: 'Incoming' }

export default function IncomingPage() {
  return <IncomingScreen />
}
