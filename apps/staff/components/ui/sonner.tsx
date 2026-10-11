'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

/** One short ink pill at the bottom, e.g. "Moved to In progress: TV won't turn on". */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      offset={96}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background shadow-lg',
        },
      }}
      {...props}
    />
  )
}
