import { cn, focusRing, pressable } from './cn'

const tile =
  'flex min-h-[220px] flex-col justify-between gap-3 rounded-md bg-surface p-5 text-left text-ink'
const tileLabel = 'text-body font-bold text-muted'
const tileValue = 'font-heading text-display-lg leading-none'
const stepButton = cn(
  'min-h-tap flex-1 rounded-pill bg-action-tint font-body text-title font-bold text-ink',
  'disabled:cursor-not-allowed disabled:opacity-50',
  pressable,
  focusRing,
)

export interface StepperProps {
  label: string
  /** Shown big, e.g. "60%". */
  value: string
  onDecrease: () => void
  onIncrease: () => void
  /** Spoken names of the buttons, e.g. "Dimmer" and "Brighter". */
  decreaseLabel: string
  increaseLabel: string
  canDecrease?: boolean
  canIncrease?: boolean
  disabled?: boolean
  className?: string
}

/** A value with − and + buttons. */
export function Stepper({
  label,
  value,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
  canDecrease = true,
  canIncrease = true,
  disabled = false,
  className,
}: StepperProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of two buttons, not a form fieldset
    <div role="group" aria-label={label} className={cn(tile, className)}>
      <span className={tileLabel}>{label}</span>
      <span className={tileValue} aria-live="polite">
        {value}
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          aria-label={decreaseLabel}
          onClick={onDecrease}
          disabled={disabled || !canDecrease}
          className={stepButton}
        >
          −
        </button>
        <button
          type="button"
          aria-label={increaseLabel}
          onClick={onIncrease}
          disabled={disabled || !canIncrease}
          className={stepButton}
        >
          +
        </button>
      </span>
    </div>
  )
}

export interface ToggleTileProps {
  label: string
  /** The current state as a word, e.g. "Open" or "Off". */
  value: string
  onToggle: () => void
  hint?: string
  disabled?: boolean
  className?: string
}

/** A whole tile that flips between two states. Shows the current state as a word. */
export function ToggleTile({
  label,
  value,
  onToggle,
  hint = 'Tap to change',
  disabled = false,
  className,
}: ToggleTileProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={`${label}: ${value}. ${hint}`}
      className={cn(
        tile,
        'disabled:cursor-not-allowed disabled:opacity-50',
        pressable,
        focusRing,
        className,
      )}
    >
      <span className={tileLabel}>{label}</span>
      <span className={tileValue}>{value}</span>
      <span className="text-body text-muted">{hint}</span>
    </button>
  )
}

export type BlindsPosition = 'open' | 'half' | 'closed'

const BLINDS_WORDS: Record<BlindsPosition, string> = {
  open: 'Open',
  half: 'Half open',
  closed: 'Closed',
}

export interface RoomControlsProps {
  /** 0..100 */
  lights: number
  temperatureF: number
  blinds: BlindsPosition
  tvOn: boolean
  onLights: (next: number) => void
  onTemperature: (next: number) => void
  onBlinds: (next: BlindsPosition) => void
  onTv: (next: boolean) => void
  lightsStep?: number
  temperatureRange?: readonly [number, number]
  disabled?: boolean
  className?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Lights, temperature, blinds and TV, as four tiles. */
export function RoomControls({
  lights,
  temperatureF,
  blinds,
  tvOn,
  onLights,
  onTemperature,
  onBlinds,
  onTv,
  lightsStep = 20,
  temperatureRange = [64, 78],
  disabled = false,
  className,
}: RoomControlsProps) {
  const [minTemp, maxTemp] = temperatureRange
  return (
    <div className={cn('grid grid-cols-4 gap-3', className)}>
      <Stepper
        label="Lights"
        value={`${lights}%`}
        decreaseLabel="Dimmer"
        increaseLabel="Brighter"
        onDecrease={() => onLights(clamp(lights - lightsStep, 0, 100))}
        onIncrease={() => onLights(clamp(lights + lightsStep, 0, 100))}
        canDecrease={lights > 0}
        canIncrease={lights < 100}
        disabled={disabled}
      />
      <Stepper
        label="Temperature"
        value={`${temperatureF}°`}
        decreaseLabel="Cooler"
        increaseLabel="Warmer"
        onDecrease={() => onTemperature(clamp(temperatureF - 1, minTemp, maxTemp))}
        onIncrease={() => onTemperature(clamp(temperatureF + 1, minTemp, maxTemp))}
        canDecrease={temperatureF > minTemp}
        canIncrease={temperatureF < maxTemp}
        disabled={disabled}
      />
      <ToggleTile
        label="Blinds"
        value={BLINDS_WORDS[blinds]}
        onToggle={() => onBlinds(blinds === 'closed' ? 'open' : 'closed')}
        disabled={disabled}
      />
      <ToggleTile
        label="TV"
        value={tvOn ? 'On' : 'Off'}
        onToggle={() => onTv(!tvOn)}
        disabled={disabled}
      />
    </div>
  )
}
