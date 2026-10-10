export type BlindsPosition = 'open' | 'half' | 'closed'

export interface TvState {
  power: boolean
  channel: number
  /** 0..100 */
  volume: number
}

export interface RoomControlsState {
  roomId: string
  /** 0 (off) .. 100 (full) */
  lights: number
  /** Setpoint in degrees Fahrenheit. */
  temperatureF: number
  blinds: BlindsPosition
  tv: TvState
}

/**
 * Lights, temperature, blinds and TV for one patient room.
 *
 * The only implementation today is the in-memory simulator below. Real adapters would plug in
 * here later: the building management system (BACnet/KNX gateway), the TV/entertainment vendor,
 * or a nurse call vendor that also exposes room controls.
 */
export interface RoomControls {
  readonly name: string
  getState(roomId: string): Promise<RoomControlsState>
  setLights(roomId: string, level: number): Promise<RoomControlsState>
  setTemperature(roomId: string, temperatureF: number): Promise<RoomControlsState>
  setBlinds(roomId: string, position: BlindsPosition): Promise<RoomControlsState>
  setTv(roomId: string, patch: Partial<TvState>): Promise<RoomControlsState>
}

const TEMPERATURE_MIN_F = 64
const TEMPERATURE_MAX_F = 78

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const defaultState = (roomId: string): RoomControlsState => ({
  roomId,
  lights: 60,
  temperatureF: 71,
  blinds: 'half',
  tv: { power: false, channel: 2, volume: 30 },
})

/** In-memory room controls for demos and tests. State is lost on restart. */
export function createSimulatedRoomControls(): RoomControls {
  const rooms = new Map<string, RoomControlsState>()

  const read = (roomId: string) => {
    const existing = rooms.get(roomId)
    if (existing) return existing
    const created = defaultState(roomId)
    rooms.set(roomId, created)
    return created
  }

  const update = async (
    roomId: string,
    change: (state: RoomControlsState) => RoomControlsState,
  ) => {
    const next = change(read(roomId))
    rooms.set(roomId, next)
    return structuredClone(next)
  }

  return {
    name: 'simulator',
    getState: async (roomId) => structuredClone(read(roomId)),
    setLights: (roomId, level) =>
      update(roomId, (s) => ({ ...s, lights: clamp(Math.round(level), 0, 100) })),
    setTemperature: (roomId, temperatureF) =>
      update(roomId, (s) => ({
        ...s,
        temperatureF: clamp(Math.round(temperatureF), TEMPERATURE_MIN_F, TEMPERATURE_MAX_F),
      })),
    setBlinds: (roomId, position) => update(roomId, (s) => ({ ...s, blinds: position })),
    setTv: (roomId, patch) =>
      update(roomId, (s) => {
        const tv = { ...s.tv, ...patch }
        return {
          ...s,
          tv: {
            power: tv.power,
            channel: Math.max(1, Math.round(tv.channel)),
            volume: clamp(Math.round(tv.volume), 0, 100),
          },
        }
      }),
  }
}
