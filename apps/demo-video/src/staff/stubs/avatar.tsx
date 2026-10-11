import type { ReactNode } from 'react'
import { Img } from 'remotion'
import { cn } from '@/lib/utils'
import jo from '../../../../staff/public/staff/jo.png'
import kai from '../../../../staff/public/staff/kai.png'
import lee from '../../../../staff/public/staff/lee.png'
import priya from '../../../../staff/public/staff/priya.png'
import sam from '../../../../staff/public/staff/sam.png'

// Stands in for apps/staff/components/ui/avatar.tsx in the video. Radix's avatar loads the photo
// on its own clock and shows initials first; Remotion's <Img> holds the frame until it is ready.
// Same classes as the original. The photos are the staff app's own (apps/staff/public/staff).

const PHOTOS: Record<string, string> = {
  '/staff/jo.png': jo,
  '/staff/kai.png': kai,
  '/staff/lee.png': lee,
  '/staff/priya.png': priya,
  '/staff/sam.png': sam,
}

export function Avatar({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <span
      data-slot="avatar"
      className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
    >
      {children}
    </span>
  )
}

export function AvatarImage({
  src,
  className,
}: {
  src?: string
  alt?: string
  className?: string
}) {
  const photo = src ? PHOTOS[src] : undefined
  if (!photo) return null
  return (
    <Img
      src={photo}
      alt=""
      className={cn('absolute inset-0 aspect-square size-full object-cover', className)}
    />
  )
}

export function AvatarFallback({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-[#E9E3DA] text-xs font-bold text-ink-strong',
        className,
      )}
    >
      {children}
    </span>
  )
}
