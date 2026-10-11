'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PatientDetails } from './patient-details'

/** One patient's details in one scroll view (no tabs). Opened from Patients rows and Incoming "All details". */
export function PatientDialog({
  patientId,
  open,
  onOpenChange,
}: {
  patientId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex max-h-[min(800px,calc(100dvh-2rem))] w-[min(1200px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        {/* Content only mounts while open, so the chart loads when the dialog opens. */}
        {patientId ? (
          <PatientDetails patientId={patientId} />
        ) : (
          <DialogTitle className="sr-only">Patient details</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  )
}
