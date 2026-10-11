'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface RejectBody {
  team?: string
  reason?: string
}

/** "Who should do it instead?" and "Why?", both optional. Empty just rejects the plan. */
export function RejectDialog({
  open,
  onOpenChange,
  busy,
  onSend,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  onSend: (body: RejectBody) => void
}) {
  const id = useId()
  const [team, setTeam] = useState('')
  const [reason, setReason] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            onSend({ team: team.trim() || undefined, reason: reason.trim() || undefined })
          }}
        >
          <DialogHeader>
            <DialogTitle>Reject Bell’s plan</DialogTitle>
            <DialogDescription>
              Both are optional. Leave them empty to just reject it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-team`}>Who should do it instead?</Label>
            <Input
              id={`${id}-team`}
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="Like Jo Turner, or Food"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-reason`}>Why?</Label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Like “He is asleep, try again at 16:00”"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Send back
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
