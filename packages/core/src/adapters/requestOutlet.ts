import type { CallRequest } from '../taxonomy'

/** A request ready to hand off: everything except what the receiving system assigns. */
export type NewCallRequest = Omit<
  CallRequest,
  'id' | 'status' | 'createdAt' | 'updatedAt' | 'seenAt' | 'claimedAt' | 'doneAt'
>

/**
 * Where a request goes once we know which team should get it.
 *
 * Today the only outlet is our own database, behind the web API (apps/web). Real adapters
 * would plug in here later: a nurse call vendor's API, an HL7/FHIR interface (e.g. a FHIR
 * ServiceRequest or Task), or a hospital work order system for facilities and housekeeping.
 */
export interface RequestOutlet {
  readonly name: string
  deliver(request: NewCallRequest): Promise<CallRequest>
}
