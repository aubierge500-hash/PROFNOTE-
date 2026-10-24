/**
 * Test navigateur (vrai IndexedDB) de la couche hors ligne.
 * Construit avec : bun build tests/browser/smoke.ts --target=browser --outfile=<dossier>/smoke.js
 * Piloté par tests/browser/run.py (Chromium + Playwright).
 */
import { createCachedFetch } from '../../src/lib/offlineCache'
import { configureOffline } from '../../src/lib/offlineNetwork'
import { ensureOutboxLoaded, flushOutbox, getPendingCount } from '../../src/lib/offlineOutbox'
import { getReplicaStatus, syncReplica } from '../../src/lib/offlineReplica'
import type { Row } from '../../src/lib/postgrestLocal'

const USER = 'u1'
const BASE = 'https://test.supabase.co'
const b64 = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const TOKEN = `${b64({ alg: 'HS256' })}.${b64({ sub: USER })}.sig`

let serverDown = false
let db: Record<string, Row[]> = {}
let app: typeof fetch

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function fakeFetch(input: any, init: RequestInit = {}): Promise<Response> {
  if (serverDown) throw new TypeError('Failed to fetch')

  const url = new URL(typeof input === 'string' ? input : input.url)
  const method = (init.method ?? 'GET').toUpperCase()
  const body = init.body ? JSON.parse(init.body as string) : null
  const table = url.pathname.split('/rest/v1/')[1]
  const rows = db[table] ?? (db[table] = [])
  const skip = ['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']
  const filters = [...url.searchParams.entries()].filter(([key]) => !skip.includes(key))
  const match = (row: Row) =>
    filters.every(([key, value]) => (value.startsWith('eq.') ? String(row[key]) === value.slice(3) : true))

  if (method === 'GET') {
    return json(200, rows.filter(match).sort((a, b) => String(a.id).localeCompare(String(b.id))))
  }
  if (method === 'POST') {
    for (const item of Array.isArray(body) ? body : [body]) {
      if (rows.some((row) => row.id === item.id)) return json(409, { code: '23505', message: 'duplicate' })
      rows.push({ ...item })
    }
    return new Response(null, { status: 201 })
  }
  if (method === 'PATCH') {
    rows.filter(match).forEach((row) => Object.assign(row, body))
    return new Response(null, { status: 204 })
  }
  db[table] = rows.filter((row) => !match(row))
  return new Response(null, { status: 204 })
}

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app(`${BASE}/rest/v1/${path}`, {
    method,
    headers: { apikey: 'anon', Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}

;(window as any).smoke = {
  init() {
    serverDown = false
    db = {
      classes: [{ id: 'c1', teacher_id: USER, name: '6e A', is_archived: false, period_count: 3 }],
      students: [{ id: 's1', teacher_id: USER, class_id: 'c1', last_name: 'AGBO', first_name: 'Ama', is_active: true }],
      evaluations: [],
      grades: [],
      profiles: [{ id: USER, full_name: 'Thècle' }]
    }
    app = createCachedFetch(fakeFetch as typeof fetch)
    configureOffline({ baseUrl: BASE, apiKey: 'anon', getAccessToken: async () => TOKEN })
  },
  setServerDown(value: boolean) {
    serverDown = value
  },
  async syncReplica() {
    return syncReplica({ userId: USER, shouldAbort: () => false })
  },
  async replicaReady() {
    return (await getReplicaStatus(USER)).ready
  },
  async createClass(name: string) {
    const response = await request(
      'POST',
      'classes?select=*',
      { teacher_id: USER, name, school_year: '2026-2027' },
      { Accept: 'application/vnd.pgrst.object+json', Prefer: 'return=representation' }
    )
    return { status: response.status, data: await response.json() }
  },
  async createStudent(classId: string, lastName: string) {
    const response = await request('POST', 'students', {
      teacher_id: USER,
      class_id: classId,
      last_name: lastName,
      first_name: 'Test',
      is_active: true
    })
    return response.status
  },
  async listClasses() {
    const response = await request('GET', `classes?select=*&teacher_id=eq.${USER}&order=name.asc`)
    return ((await response.json()) as Row[]).map((row) => row.name)
  },
  async listStudents(classId: string) {
    const response = await request('GET', `students?select=*&class_id=eq.${classId}&order=last_name.asc`)
    return ((await response.json()) as Row[]).map((row) => row.last_name)
  },
  async pending() {
    await ensureOutboxLoaded()
    return getPendingCount()
  },
  async flush() {
    const { sent, failed, stopped } = await flushOutbox()
    return { sent, failed, stopped }
  },
  serverClasses() {
    return db.classes.map((row) => row.name).sort()
  },
  serverStudents() {
    return db.students.map((row) => row.last_name).sort()
  }
}
