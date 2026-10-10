// Shared by server validation and pages: room ids like "412" or "4B-12".
const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/

export const isRoomId = (value: unknown): value is string =>
  typeof value === 'string' && ROOM_ID.test(value)
