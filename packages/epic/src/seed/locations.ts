// Unit 4 West: the ward, its rooms, and beds where a room is shared.

import { coding, SYS } from '../codes'
import type { Location } from '../fhir'

const ROOMS: Record<string, string[]> = {
  '410': [],
  '412': ['A', 'B', '3'],
  '414': [],
  '416': ['A', 'B'],
  '418': [],
  '420': [],
  '422': [],
  '424': [],
  '426': [],
}

/** Location id for a room ("loc-414") or a bed ("loc-412A"). */
export const locationId = (room: string, bed = '') => `loc-${room}${bed}`

export function locationResources(): Location[] {
  const unit: Location = {
    resourceType: 'Location',
    id: 'loc-4west',
    status: 'active',
    name: '4 West',
    physicalType: { coding: [coding(SYS.locationType, 'wa', 'Ward')] },
  }
  const rest = Object.entries(ROOMS).flatMap(([room, beds]) => {
    const roomLoc: Location = {
      resourceType: 'Location',
      id: locationId(room),
      status: 'active',
      name: `Room ${room}`,
      identifier: [{ system: SYS.room, value: room }],
      physicalType: { coding: [coding(SYS.locationType, 'ro', 'Room')] },
      partOf: { reference: 'Location/loc-4west', display: '4 West' },
    }
    const bedLocs = beds.map(
      (bed): Location => ({
        resourceType: 'Location',
        id: locationId(room, bed),
        status: 'active',
        name: `Room ${room}, Bed ${bed}`,
        identifier: [
          { system: SYS.room, value: room },
          { system: SYS.bed, value: bed },
        ],
        physicalType: { coding: [coding(SYS.locationType, 'bd', 'Bed')] },
        partOf: { reference: `Location/${locationId(room)}`, display: `Room ${room}` },
      }),
    )
    return [roomLoc, ...bedLocs]
  })
  return [unit, ...rest]
}
