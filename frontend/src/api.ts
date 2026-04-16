import type { TriageResponse } from './types'

// In production the frontend is served by the FastAPI backend (same origin),
// so all API calls use relative paths. In dev the backend is on :8000.
const BASE = import.meta.env.DEV ? 'http://localhost:8000' : ''

export async function fetchResults(): Promise<TriageResponse> {
  const res = await fetch(`${BASE}/api/results`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function markReviewed(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/results/${id}/review`, { method: 'POST' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
}

export async function clearNormals(): Promise<{ cleared: number }> {
  const res = await fetch(`${BASE}/api/results/clear-normals`, { method: 'POST' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function uploadFile(file: File): Promise<{ filename: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `Upload failed (${res.status})`)
  }
  return res.json()
}

export async function loadDemoData(): Promise<{ files_copied: number }> {
  const res = await fetch(`${BASE}/api/load-demo`, { method: 'POST' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function resetDatabase(): Promise<{ deleted: number }> {
  const res = await fetch(`${BASE}/api/reset`, { method: 'POST' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}
