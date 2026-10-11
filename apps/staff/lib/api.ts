import type {
  AskPlan,
  IncomingItem,
  PatientDetail,
  PatientRow,
  Session,
  Task,
  TaskStatus,
} from '@bell/core/staff-api'

// Client calls to apps/web's /api/staff/* routes, through this app's /api proxy (next.config.ts).
// The session cookie rides along, so the backend knows who is signed in.

/** A non-2xx answer from the Bell API. `status` 401 means the session is missing or expired. */
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`Could not reach Bell (HTTP ${status})`)
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  })
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as T
}

const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  incoming: () => call<IncomingItem[]>('/api/staff/incoming'),
  approve: (id: string, body: { note?: string; sendIds?: string[] } = {}) =>
    post<IncomingItem>(`/api/staff/incoming/${id}/approve`, body),
  reject: (id: string, body: { team?: string; reason?: string } = {}) =>
    post<IncomingItem>(`/api/staff/incoming/${id}/reject`, body),

  patients: (scope: 'mine' | 'floor') => call<PatientRow[]>(`/api/staff/patients?scope=${scope}`),
  takePatient: (id: string) => post<PatientRow>(`/api/staff/patients/${id}/take`),
  patient: (id: string) => call<PatientDetail>(`/api/staff/patients/${id}`),

  tasks: (scope: 'mine' | 'everyone') => call<Task[]>(`/api/staff/tasks?scope=${scope}`),
  moveTask: (id: string, status: TaskStatus) =>
    call<Task>(`/api/staff/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  takeTask: (id: string) =>
    call<Task>(`/api/staff/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ take: true }) }),

  ask: (text: string) => post<AskPlan>('/api/staff/ask', { text }),
  confirmAsk: (id: string) => post<Task>(`/api/staff/ask/${id}/confirm`),

  login: (email: string, password: string) =>
    post<Session>('/api/staff/login', { email, password }),
  logout: () => post<{ ok: true }>('/api/staff/logout'),
  me: () => call<Session>('/api/staff/me'),
}
