import { type CallRequest, NURSE_BUTTON, optionById } from '@bell/core/taxonomy'

/** Short patient-facing name of a request (never the team): the option, the button, or their words. */
export const patientLabel = (request: CallRequest): string => {
  if (request.source === 'nurse_button') return NURSE_BUTTON.label
  if (request.source === 'tile' && request.optionId) return optionById(request.optionId).label
  return request.text ?? request.staffSummary
}

/** Clock time for the patient's list, e.g. "2:41 PM". */
export const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
