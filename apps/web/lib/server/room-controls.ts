import { createSimulatedRoomControls, type RoomControls } from '@bell/core/adapters'

// One RoomControls for the whole process, on globalThis so every route module and dev HMR reload
// share the same (in-memory) room state. Swap the simulator for a real adapter here.
const globalForControls = globalThis as typeof globalThis & { __bellRoomControls?: RoomControls }

export const roomControls = (): RoomControls => {
  if (!globalForControls.__bellRoomControls) {
    globalForControls.__bellRoomControls = createSimulatedRoomControls()
  }
  return globalForControls.__bellRoomControls
}
