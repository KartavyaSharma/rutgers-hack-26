'use client'

import type { StaffMember } from '@bell/core/hospital'
import { createContext, type ReactNode, useContext } from 'react'

interface StaffContextValue {
  /** The signed-in staff member. */
  staff: StaffMember
  /** Ask the shell to refetch the Incoming count in the top bar (after approve / reject). */
  refreshCounts: () => void
}

const StaffContext = createContext<StaffContextValue | null>(null)

export function StaffProvider({
  value,
  children,
}: {
  value: StaffContextValue
  children: ReactNode
}) {
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>
}

/** Who is signed in. Only inside the (staff) layout. */
export function useStaff(): StaffContextValue {
  const value = useContext(StaffContext)
  if (!value) throw new Error('useStaff must be used inside the staff layout')
  return value
}
