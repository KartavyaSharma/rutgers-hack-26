import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the custom theme keys from theme.css, so `text-body` is read as a
// font size (not a color) and `min-h-tap` conflicts with `min-h-24`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'caption',
        'body',
        'lead',
        'label',
        'title',
        'heading',
        'display',
        'display-lg',
        'display-xl',
        'hero',
      ],
      leading: ['body'],
      radius: ['pill', 'chip'],
      shadow: ['raised'],
      spacing: [
        'tap',
        'tap-lg',
        'tile',
        'main',
        'disc',
        'disc-lg',
        'disc-xl',
        'disc-listen',
        'tap-xl',
        'ring',
        'column',
        'dialog',
        'sheet',
        'space-1',
        'space-2',
        'space-3',
        'space-4',
        'space-5',
        'space-6',
        'space-7',
        'space-8',
        'space-9',
        'space-10',
        'space-11',
        'space-12',
      ],
      animate: ['ripple', 'ripple-soft'],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Visible focus outline for keyboard and switch users (design-system focus tokens). */
export const focusRing =
  'focus-visible:outline-solid focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-[var(--focus-gap)] focus-visible:outline-focus'

/** Press feedback and transitions shared by the buttons. Duration is 0 under reduced motion. */
export const pressable =
  'touch-manipulation select-none transition-[background-color,box-shadow,scale,filter] duration-(--motion-duration) ease-(--motion-ease) active:scale-[0.98]'
