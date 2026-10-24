/**
 * Tests de la couche hors ligne (lancer avec : bun test tests/offline.test.ts).
 * Un faux serveur remplace Supabase ; on coupe le réseau, on modifie des données, puis on le rétablit.
 */
import { beforeAll, describe, expect, test } from 'bun:test'

import { createCachedFetch } from '../src/lib/offlineCache'
import { configureOffline, markNetworkUp } from '../src/lib/offlineNetwork'
import {
  discardFailed,
  ensureOutboxLoaded,
  flushOutbox,
  getFailedCount,
  getPendingCount,
  listFailed
} from '../src/lib/offlineOutbox'
import { getReplicaStatus, syncReplica } from '../src/lib/offlineReplica'
import {
  matchRow,
  newUuid,
  parseQuery,
  parseSelect,
  runLocalQuery,
  sortRows,
  type Row
} from '../src/lib/postgrestLocal'

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

const USER = 'u1'
const OTHER = 'u2'
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const TOKEN = `${b64({ alg: 'HS256' })}.${b64({ sub: USER })}.sig`
const OTHER_TOKEN = `${b64({ alg: 'HS256' })}.${b64({ sub: OTHER })}.sig`
const BASE = 'https://test.supabase.co'

function setOnline(value: boolean): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: value },
    configurable: true,
    writable: true
  })
  if (value) markNetworkUp()
}

interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body: any
}

const calls: Call[] = []
const forced: Array<(call: Call) => Response | null> = []
let serverDown = false

const db: Record<string, Row[]> = {}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function fakeFetch(input: any, init: RequestInit = {}): Promise<Response> {
  if (serverDown) throw new TypeError('Failed to fetch')

  const url = new URL(typeof input === 'string' ? input : input.url)
  const headers = Object.fromEntries(new Headers(init.headers as any).entries())
  const method = (init.method ?? 'GET').toUpperCase()
  const body = init.body ? JSON.parse(init.body as string) : null
  const call: Call = { method, url: url.toString(), headers, body }
  calls.push(call)

  for (const handler of forced) {
    const response = handler(call)
    if (response) return response
  }

  const table = url.pathname.split('/rest/v1/')[1]
  const rows = db[table] ?? []
  const skip = ['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']
  const filters = [...url.searchParams.entries()].filter(([key]) => !skip.includes(key))
  const match = (row: Row) =>
    filters.every(([key, value]) => (value.startsWith('eq.') ? String(row[key]) === value.slice(3) : true))

  if (method === 'GET') {
    const limit = Number(url.searchParams.get('limit') ?? 1e9)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const out = rows
      .filter(match)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .slice(offset, offset + limit)
    return json(200, out)
  }
  if (method === 'POST') {
    const items = Array.isArray(body) ? body : [body]
    for (const item of items) {
      if (rows.some((row) => row.id === item.id)) {
        return json(409, { code: '23505', message: 'duplicate key value violates unique constraint' })
      }
      rows.push({ ...item })
    }
    db[table] = rows
    return new Response(null, { status: 201 })
  }
  if (method === 'PATCH' || method === 'DELETE') {
    // Comme le vrai serveur : une modification ou suppression sans filtre est refusée.
    if (filters.length === 0) {
      return json(400, { code: '21000', message: `${method} requires a WHERE clause` })
    }
    if (method === 'PATCH') {
      rows.filter(match).forEach((row) => Object.assign(row, body))
    } else {
      db[table] = rows.filter((row) => !match(row))
    }
    return new Response(null, { status: 204 })
  }
  return json(400, { message: 'inconnu' })
}

const app = createCachedFetch(fakeFetch as typeof fetch)

function request(method: string, path: string, options: { body?: unknown; headers?: Record<string, string>; token?: string } = {}) {
  return app(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: 'anon',
      Authorization: `Bearer ${options.token ?? TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })
}

const get = async (path: string, headers?: Record<string, string>) => {
  const response = await request('GET', path, { headers })
  return { response, data: response.status === 204 ? null : await response.json().catch(() => null) }
}

const SINGLE = { Accept: 'application/vnd.pgrst.object+json', Prefer: 'return=representation' }

// ---------------------------------------------------------------------------
// Moteur de requêtes (pur)
// ---------------------------------------------------------------------------

describe('moteur de requêtes local', () => {
  const rows: Row[] = [
    { id: 'a', name: 'Zoé', level: '6e', n: 5, active: true, class_id: null },
    { id: 'b', name: 'Éric', level: '5e', n: 12, active: false, class_id: 'c1' },
    { id: 'c', name: 'Alice', level: null, n: 7, active: true, class_id: 'c1' }
  ]

  test('filtres eq / neq / in / is / not / comparaisons', () => {
    const run = (qs: string) => rows.filter((r) => matchRow(r, parseQuery(qs).filters)).map((r) => r.id)
    expect(run('level=eq.6e')).toEqual(['a'])
    expect(run('active=eq.true')).toEqual(['a', 'c'])
    expect(run('level=is.null')).toEqual(['c'])
    expect(run('level=not.is.null')).toEqual(['a', 'b'])
    expect(run('n=gt.6')).toEqual(['b', 'c'])
    expect(run('n=lte.7')).toEqual(['a', 'c'])
    expect(run('id=in.(a,c)')).toEqual(['a', 'c'])
    expect(run('level=neq.6e')).toEqual(['b']) // la valeur nulle n'est jamais « différente »
    expect(run('name=ilike.*ALI*')).toEqual(['c'])
  })

  test('syntaxe non gérée signalée', () => {
    expect(parseQuery('or=(a.eq.1,b.eq.2)').unsupported).toBe(true)
    expect(parseQuery('students.class_id=eq.x').unsupported).toBe(true)
    expect(parseSelect('a:b')).toBeNull()
  })

  test('tri : accents, nulls et décroissant', () => {
    const order = (qs: string) => sortRows(rows, parseQuery(qs).order).map((r) => r.id)
    expect(order('order=name.asc')).toEqual(['c', 'b', 'a']) // Alice, Éric, Zoé
    expect(order('order=n.desc')).toEqual(['b', 'c', 'a'])
    expect(order('order=level.asc')).toEqual(['b', 'a', 'c']) // nul en dernier
    expect(order('order=level.desc')).toEqual(['c', 'a', 'b']) // nul en premier
  })

  test('comptage, HEAD, limite et objet unique', () => {
    const table = (name: string) => (name === 't' ? rows : null)
    const head = runLocalQuery({ table: 't', method: 'HEAD', search: '?select=id&active=eq.true', accept: '', prefer: 'count=exact' }, table)
    expect(head?.contentRange).toBe('0-1/2')
    expect(head?.body).toBe('')

    const limited = runLocalQuery({ table: 't', method: 'GET', search: '?select=id&order=id.asc&limit=1', accept: '', prefer: '' }, table)
    expect(JSON.parse(limited!.body)).toEqual([{ id: 'a' }])

    const single = runLocalQuery({ table: 't', method: 'GET', search: '?select=*&id=eq.b', accept: 'application/vnd.pgrst.object+json', prefer: '' }, table)
    expect(JSON.parse(single!.body).name).toBe('Éric')

    const none = runLocalQuery({ table: 't', method: 'GET', search: '?select=*&id=eq.zzz', accept: 'application/vnd.pgrst.object+json', prefer: '' }, table)
    expect(none?.status).toBe(406)
    expect(JSON.parse(none!.body).code).toBe('PGRST116')
  })

  test('jointure plusieurs-à-un', () => {
    const tables: Record<string, Row[]> = {
      grades: [{ id: 'g1', evaluation_id: 'e1', score: 10 }, { id: 'g2', evaluation_id: null, score: 5 }],
      evaluations: [{ id: 'e1', title: 'Devoir 1', coefficient: 2 }]
    }
    const result = runLocalQuery(
      { table: 'grades', method: 'GET', search: '?select=id,score,evaluations(id,title)&order=id.asc', accept: '', prefer: '' },
      (name) => tables[name] ?? null
    )
    expect(JSON.parse(result!.body)).toEqual([
      { id: 'g1', score: 10, evaluations: { id: 'e1', title: 'Devoir 1' } },
      { id: 'g2', score: 5, evaluations: null }
    ])
  })

  test('jointure inconnue : le moteur renonce', () => {
    const result = runLocalQuery(
      { table: 'classes', method: 'GET', search: '?select=*,students(*)', accept: '', prefer: '' },
      () => [{ id: 'c1', name: '6e A' }]
    )
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Scénario complet : hors ligne puis retour du réseau
// ---------------------------------------------------------------------------

describe('scénario hors ligne', () => {
  beforeAll(() => {
    configureOffline({ baseUrl: BASE, apiKey: 'anon', getAccessToken: async () => TOKEN })

    db.classes = [{ id: 'c1', teacher_id: USER, name: '6e A', level: '6e', school_year: '2026-2027', is_archived: false, period_count: 3 }]
    db.students = [
      { id: 's1', teacher_id: USER, class_id: 'c1', last_name: 'AGBO', first_name: 'Ama', is_active: true },
      { id: 's2', teacher_id: USER, class_id: 'c1', last_name: 'KOFFI', first_name: 'Yao', is_active: true }
    ]
    db.evaluations = [{ id: 'e1', teacher_id: USER, class_id: 'c1', title: 'Devoir 1', coefficient: 2, max_score: 20, period: 1, eval_date: '2026-10-01' }]
    db.grades = [
      { id: 'g1', teacher_id: USER, evaluation_id: 'e1', student_id: 's1', score: 10, is_absent: false },
      { id: 'g2', teacher_id: USER, evaluation_id: 'e1', student_id: 's2', score: 14, is_absent: false }
    ]
    // Données d'un autre enseignant : ne doivent jamais apparaître.
    db.classes.push({ id: 'cx', teacher_id: OTHER, name: 'Autre', level: '3e', is_archived: false })
    db.profiles = [{ id: USER, full_name: 'Thècle', role: 'teacher' }]
    setOnline(true)
  })

  test('copie des données puis lecture sans réseau', async () => {
    expect(await syncReplica({ userId: USER, shouldAbort: () => false })).toBe(true)
    expect((await getReplicaStatus(USER)).ready).toBe(true)

    setOnline(false)
    serverDown = true
    calls.length = 0

    const { data } = await get(`classes?select=*&teacher_id=eq.${USER}&order=created_at.desc`)
    expect(data.map((c: Row) => c.name)).toEqual(['6e A'])
    expect(calls.length).toBe(0) // aucune requête réseau

    const profile = await get(`profiles?select=*&id=eq.${USER}`, { Accept: 'application/vnd.pgrst.object+json' })
    expect(profile.data.full_name).toBe('Thècle')

    // Sans filtre sur « id », la copie ne répond pas (un administrateur verrait d'autres profils).
    await expect(get('profiles?select=id,full_name')).rejects.toThrow()
  })

  test('vues : moyennes, rangs et statistiques recalculées', async () => {
    const averages = (await get(`student_averages?select=*&teacher_id=eq.${USER}`)).data
    expect(averages.find((a: Row) => a.student_id === 's1').average).toBe(10)

    const stats = (await get('evaluation_stats?select=*&evaluation_id=eq.e1', { Accept: 'application/vnd.pgrst.object+json' })).data
    expect(stats.class_average).toBe(12)
    expect(stats.best_score).toBe(14)
    expect(stats.nb_graded).toBe(2)

    const ranking = (await get('student_rankings?select=*&class_id=eq.c1&order=rank.asc')).data
    expect(ranking.map((r: Row) => [r.student_id, r.rank])).toEqual([['s2', 1], ['s1', 2]])
  })

  test('création de classe hors ligne : réponse immédiate et visible tout de suite', async () => {
    const response = await request('POST', 'classes?select=*', {
      body: { teacher_id: USER, name: '5e B', level: '5e', school_year: '2026-2027' },
      headers: SINGLE
    })
    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created.name).toBe('5e B')
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.is_archived).toBe(false)
    expect(created.period_count).toBe(3)

    const list = (await get(`classes?select=*&teacher_id=eq.${USER}&is_archived=eq.false`)).data
    expect(list.map((c: Row) => c.name).sort()).toEqual(['5e B', '6e A'])
    expect(getPendingCount()).toBe(1)
    ;(globalThis as any).newClassId = created.id
  })

  test('élèves, évaluation et notes hors ligne', async () => {
    const classId = (globalThis as any).newClassId as string

    await request('POST', 'students', {
      body: { teacher_id: USER, class_id: classId, last_name: 'DOSSOU', first_name: 'Rita', is_active: true }
    })
    await request('POST', 'students', {
      body: [
        { teacher_id: USER, class_id: classId, last_name: 'HOUNSA', first_name: 'Paul', is_active: true },
        { teacher_id: USER, class_id: classId, last_name: 'ADJO', first_name: 'Eve', is_active: true }
      ]
    })

    const students = (await get(`students?select=*&class_id=eq.${classId}&is_active=eq.true&order=last_name.asc`)).data
    expect(students.map((s: Row) => s.last_name)).toEqual(['ADJO', 'DOSSOU', 'HOUNSA'])

    const evaluation = await (
      await request('POST', 'evaluations?select=*', {
        body: { teacher_id: USER, class_id: classId, title: 'Interro 1', type: 'interrogation', subject: 'PCT', coefficient: 2 },
        headers: SINGLE
      })
    ).json()
    expect(evaluation.max_score).toBe(20)
    expect(evaluation.period).toBe(1)
    expect(evaluation.eval_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Note créée puis modifiée avant même d'avoir été envoyée.
    const grade = await (
      await request('POST', 'grades?select=*', {
        body: { teacher_id: USER, evaluation_id: evaluation.id, student_id: students[0].id, score: 8, is_absent: false, source: 'manual' },
        headers: SINGLE
      })
    ).json()
    const updated = await (
      await request('PATCH', `grades?id=eq.${grade.id}&teacher_id=eq.${USER}&select=*`, {
        body: { score: 16 },
        headers: SINGLE
      })
    ).json()
    expect(updated.score).toBe(16)
    expect(updated.id).toBe(grade.id)

    const stats = (await get(`evaluation_stats?select=*&evaluation_id=eq.${evaluation.id}`, { Accept: 'application/vnd.pgrst.object+json' })).data
    expect(stats.class_average).toBe(16)
    ;(globalThis as any).evaluationId = evaluation.id
    ;(globalThis as any).softDeletedStudent = students[1].id

    // Retrait (« soft delete ») d'un élève : il disparaît de la liste des élèves actifs.
    await request('PATCH', `students?id=eq.${students[1].id}`, { body: { is_active: false } })
    const after = (await get(`students?select=*&class_id=eq.${classId}&is_active=eq.true&order=last_name.asc`)).data
    expect(after.map((s: Row) => s.last_name)).toEqual(['ADJO', 'HOUNSA'])
  })

  test('suppression d’une classe : cascade locale comme sur le serveur', async () => {
    await request('DELETE', `classes?id=eq.c1&teacher_id=eq.${USER}`)

    const classes = (await get(`classes?select=*&teacher_id=eq.${USER}`)).data
    expect(classes.map((c: Row) => c.name)).toEqual(['5e B'])

    expect((await get('students?select=*&class_id=eq.c1')).data).toEqual([])
    expect((await get('evaluations?select=*&class_id=eq.c1')).data).toEqual([])
    expect((await get('grades?select=*&evaluation_id=eq.e1')).data).toEqual([])
  })

  test('une suppression sans filtre n’efface rien localement', async () => {
    const before = (await get(`classes?select=*&teacher_id=eq.${USER}`)).data.length
    await request('DELETE', 'classes')
    expect((await get(`classes?select=*&teacher_id=eq.${USER}`)).data.length).toBe(before)
  })

  test('retour du réseau : tout part dans l’ordre, avec un jeton frais, sans doublon', async () => {
    const pending = getPendingCount()
    expect(pending).toBeGreaterThanOrEqual(8)

    serverDown = false
    setOnline(true)
    calls.length = 0

    const result = await flushOutbox()
    expect(result.stopped).toBeNull()
    // Tout part, sauf la suppression sans filtre que le serveur refuse (mise de côté, rien n'est perdu ni effacé).
    expect(result.sent).toBe(pending - 1)
    expect(result.failed).toBe(1)
    expect(getPendingCount()).toBe(0)
    expect((await listFailed())[0].error).toContain('requires a WHERE clause')
    await discardFailed()

    // L'ordre d'origine est respecté : la classe est créée avant ses élèves, et les notes après l'évaluation.
    const order = calls.map((c) => `${c.method} ${new URL(c.url).pathname.split('/rest/v1/')[1].split('?')[0]}`)
    expect(order.indexOf('POST classes')).toBeLessThan(order.indexOf('POST students'))
    expect(order.indexOf('POST evaluations')).toBeLessThan(order.indexOf('POST grades'))
    expect(order.indexOf('POST grades')).toBeLessThan(order.indexOf('PATCH grades'))
    expect(calls.every((c) => c.headers.authorization === `Bearer ${TOKEN}`)).toBe(true)
    expect(calls.every((c) => c.headers.apikey === 'anon')).toBe(true)

    // État final du serveur.
    expect(db.classes.map((c) => c.name).sort()).toEqual(['5e B', 'Autre'])
    const newClass = db.classes.find((c) => c.name === '5e B')!
    expect(newClass.id).toBe((globalThis as any).newClassId)
    expect(db.students.filter((s) => s.class_id === newClass.id).length).toBe(3)
    const gradeOnServer = db.grades.find((g) => g.evaluation_id === (globalThis as any).evaluationId)!
    expect(gradeOnServer.score).toBe(16)
    expect(db.students.find((s) => s.id === (globalThis as any).softDeletedStudent)!.is_active).toBe(false)
  })

  test('en ligne et sans file : envoi direct, identifiant fourni par l’appareil', async () => {
    calls.length = 0
    const response = await request('POST', 'students', {
      body: { teacher_id: USER, class_id: 'c-new', last_name: 'TEST', first_name: 'Direct', is_active: true }
    })
    expect(response.status).toBe(201)
    expect(calls.length).toBe(1)
    expect(calls[0].body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(getPendingCount()).toBe(0)
  })

  test('ajout groupé : « id » ajouté à la liste ?columns= pour que le serveur garde nos identifiants', async () => {
    calls.length = 0
    const columns = encodeURIComponent('"teacher_id","class_id","last_name"')
    const response = await request('POST', `students?columns=${columns}`, {
      body: [
        { teacher_id: USER, class_id: 'c-new', last_name: 'LOT1' },
        { teacher_id: USER, class_id: 'c-new', last_name: 'LOT2' }
      ]
    })
    expect(response.status).toBe(201)
    expect(decodeURIComponent(new URL(calls[0].url).searchParams.get('columns')!)).toBe(
      '"teacher_id","class_id","last_name","id"'
    )
    expect(calls[0].body.every((row: Row) => typeof row.id === 'string')).toBe(true)
  })

  test('réponse perdue puis renvoi : le doublon est reconnu comme déjà reçu', async () => {
    serverDown = true
    setOnline(false)
    const id = newUuid()
    await request('POST', 'students', {
      body: { id, teacher_id: USER, class_id: 'c-new', last_name: 'DOUBLON', first_name: 'Test', is_active: true }
    })
    expect(getPendingCount()).toBe(1)

    // Le serveur a déjà reçu cette création (réponse perdue lors de la première tentative).
    db.students.push({ id, teacher_id: USER, class_id: 'c-new', last_name: 'DOUBLON' })
    serverDown = false
    setOnline(true)

    const result = await flushOutbox()
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(0)
    expect(db.students.filter((s) => s.id === id).length).toBe(1)
  })

  test('modification refusée par le serveur : mise de côté, les suivantes continuent', async () => {
    serverDown = true
    setOnline(false)
    await request('PATCH', 'classes?id=eq.nope', { body: { name: 'x'.repeat(10) } })
    await request('PATCH', `classes?id=eq.${(globalThis as any).newClassId}`, { body: { name: '5e B (renommée)' } })

    forced.push((call) =>
      call.method === 'PATCH' && call.url.includes('id=eq.nope')
        ? json(400, { code: '23514', message: 'violates check constraint' })
        : null
    )
    serverDown = false
    setOnline(true)

    const result = await flushOutbox()
    forced.length = 0

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
    expect(getFailedCount()).toBe(1)
    expect((await listFailed())[0].error).toBe('violates check constraint')
    expect(db.classes.find((c) => c.id === (globalThis as any).newClassId)!.name).toBe('5e B (renommée)')

    await discardFailed()
    expect(getFailedCount()).toBe(0)
  })

  test('erreur serveur 500 : on s’arrête et on garde tout pour plus tard', async () => {
    serverDown = true
    setOnline(false)
    await request('PATCH', `classes?id=eq.${(globalThis as any).newClassId}`, { body: { level: '4e' } })
    forced.push(() => json(503, { message: 'indisponible' }))
    serverDown = false
    setOnline(true)

    const result = await flushOutbox()
    forced.length = 0
    expect(result.stopped).toBe('server')
    expect(getPendingCount()).toBe(1)

    expect((await flushOutbox()).sent).toBe(1)
    expect(getPendingCount()).toBe(0)
  })

  test('les modifications d’un autre compte ne sont jamais envoyées avec le mauvais jeton', async () => {
    serverDown = true
    setOnline(false)
    await request('PATCH', 'classes?id=eq.cx', { body: { name: 'Piraté' }, token: OTHER_TOKEN })
    expect(getPendingCount()).toBe(1)

    serverDown = false
    setOnline(true)
    calls.length = 0
    const result = await flushOutbox() // session courante = USER
    expect(result.sent).toBe(0)
    expect(calls.length).toBe(0)
    expect(getPendingCount()).toBe(1) // reste en attente pour son propriétaire
  })

  test('la file est chargée au démarrage', async () => {
    await ensureOutboxLoaded()
    expect(getPendingCount()).toBe(1)
  })
})
