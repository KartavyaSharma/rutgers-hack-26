import type { Metadata } from 'next'
import { DesignGallery } from './gallery'

export const metadata: Metadata = { title: 'Design system' }

/** Every tablet component and state, in Clay and Night. */
export default function DesignPage() {
  return <DesignGallery />
}
