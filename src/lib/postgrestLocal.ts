/**
 * Mini moteur « PostgREST » local.
 *
 * Répond, à partir de la copie locale des données, aux requêtes de lecture que fait
 * l'application (filtres eq/in/is…, tri, limit, select avec colonnes ou jointure simple,
 * comptage, objet unique) et recalcule les trois vues du serveur (moyennes, rangs,
 * statistiques d'évaluation). Aucune dépendance : fonctions pures, testables sans navigateur.
 *
 * Quand une requête utilise une syntaxe non gérée, les fonctions renvoient `null` :
 * l'appelant se rabat alors sur une autre source (dernière réponse mémorisée).
 */

export type Row = Record<string, unknown>

// ---------------------------------------------------------------------------
// Lecture de la requête
// ---------------------------------------------------------------------------

export interface Filter {
  column: string
  op: string
  value: string
  negate: boolean
}

export interface OrderTerm {
  column: string
  desc: boolean
  nullsFirst: boolean | null
}

export interface ParsedQuery {
  filters: Filter[]
  /** Vrai si la requête contient une syntaxe que ce moteur ne sait pas évaluer (or=, and=, jointure filtrée…). */
  unsupported: boolean
  select: string
  order: OrderTerm[]
  limit: number | null
  offset: number
  onConflict: string[]
}

const SUPPORTED_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'like', 'ilike'])
const NON_FILTER_KEYS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'count'])
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

function parseOrder(raw: string): OrderTerm[] | null {
  const terms: OrderTerm[] = []

  for (const part of raw.split(',')) {
    const pieces = part.trim().split('.')
    const column = pieces[0]
    if (!column || !IDENT.test(column)) return null

    let desc = false
    let nullsFirst: boolean | null = null

    for (const modifier of pieces.slice(1)) {
      if (modifier === 'desc') desc = true
      else if (modifier === 'asc') desc = false
      else if (modifier === 'nullsfirst') nullsFirst = true
      else if (modifier === 'nullslast') nullsFirst = false
      else return null
    }

    terms.push({ column, desc, nullsFirst })
  }

  return terms
}

export function parseQuery(search: string): ParsedQuery {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)

  const query: ParsedQuery = {
    filters: [],
    unsupported: false,
    select: '*',
    order: [],
    limit: null,
    offset: 0,
    onConflict: []
  }

  params.forEach((raw, key) => {
    if (key === 'select') {
      query.select = raw || '*'
      return
    }
    if (key === 'order') {
      const order = parseOrder(raw)
      if (order) query.order = order
      else query.unsupported = true
      return
    }
    if (key === 'limit') {
      const n = Number(raw)
      if (Number.isInteger(n) && n >= 0) query.limit = n
      return
    }
    if (key === 'offset') {
      const n = Number(raw)
      if (Number.isInteger(n) && n >= 0) query.offset = n
      return
    }
    if (key === 'on_conflict') {
      query.onConflict = raw
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean)
      return
    }
    if (NON_FILTER_KEYS.has(key)) return

    // Filtres logiques (or/and) et filtres sur une jointure (« table.colonne ») : non gérés.
    if (key === 'and' || key === 'or' || key.includes('.')) {
      query.unsupported = true
      return
    }

    let rest = raw
    let negate = false
    if (rest.startsWith('not.')) {
      negate = true
      rest = rest.slice(4)
    }

    const dot = rest.indexOf('.')
    const op = dot === -1 ? '' : rest.slice(0, dot)

    if (!SUPPORTED_OPS.has(op)) {
      query.unsupported = true
      return
    }

    query.filters.push({ column: key, op, value: rest.slice(dot + 1), negate })
  })

  return query
}

// ---------------------------------------------------------------------------
// Filtres
// ---------------------------------------------------------------------------

function isNumeric(text: string): boolean {
  return text.trim() !== '' && Number.isFinite(Number(text))
}

/** Compare une cellule à la valeur d'un filtre (nombres comparés comme des nombres). */
function compareToValue(cell: unknown, value: string): number {
  if (typeof cell === 'number' && isNumeric(value)) return cell - Number(value)
  const text = String(cell)
  if (text < value) return -1
  if (text > value) return 1
  return 0
}

function parseInList(value: string): string[] {
  const inner = value.startsWith('(') && value.endsWith(')') ? value.slice(1, -1) : value
  if (inner === '') return []

  const items: string[] = []
  let current = ''
  let quoted = false

  for (const char of inner) {
    if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      items.push(current)
      current = ''
    } else {
      current += char
    }
  }
  items.push(current)

  return items
}

function likeToRegExp(pattern: string, caseInsensitive: boolean): RegExp {
  const source = pattern
    .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
    .replace(/[*%]/g, '.*')
    .replace(/_/g, '.')
  return new RegExp(`^${source}$`, caseInsensitive ? 'is' : 's')
}

function evalFilter(row: Row, filter: Filter): boolean {
  // Colonne absente de la ligne copiée (sélection partielle) : on ne peut pas juger, on ignore le filtre.
  if (!(filter.column in row)) return true

  const cell = row[filter.column]

  if (filter.op === 'is') {
    let result: boolean
    if (filter.value === 'null') result = cell === null || cell === undefined
    else if (filter.value === 'true') result = cell === true
    else if (filter.value === 'false') result = cell === false
    else result = false
    return filter.negate ? !result : result
  }

  // Comme en SQL, une valeur nulle ne satisfait jamais une comparaison (même avec « not »).
  if (cell === null || cell === undefined) return false

  let result: boolean
  switch (filter.op) {
    case 'eq':
      result = compareToValue(cell, filter.value) === 0
      break
    case 'neq':
      result = compareToValue(cell, filter.value) !== 0
      break
    case 'gt':
      result = compareToValue(cell, filter.value) > 0
      break
    case 'gte':
      result = compareToValue(cell, filter.value) >= 0
      break
    case 'lt':
      result = compareToValue(cell, filter.value) < 0
      break
    case 'lte':
      result = compareToValue(cell, filter.value) <= 0
      break
    case 'in':
      result = parseInList(filter.value).some((item) => compareToValue(cell, item) === 0)
      break
    case 'like':
      result = likeToRegExp(filter.value, false).test(String(cell))
      break
    case 'ilike':
      result = likeToRegExp(filter.value, true).test(String(cell))
      break
    default:
      result = false
  }

  return filter.negate ? !result : result
}

export function matchRow(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => evalFilter(row, filter))
}

// ---------------------------------------------------------------------------
// Tri
// ---------------------------------------------------------------------------

function compareCells(a: unknown, b: unknown, term: OrderTerm): number {
  const aNull = a === null || a === undefined
  const bNull = b === null || b === undefined

  if (aNull || bNull) {
    if (aNull && bNull) return 0
    // Comme PostgreSQL : en ordre croissant les valeurs nulles sont en dernier, en décroissant en premier.
    const nullsFirst = term.nullsFirst ?? term.desc
    const nullBefore = nullsFirst ? -1 : 1
    return aNull ? nullBefore : -nullBefore
  }

  let result: number
  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b
  } else if (typeof a === 'boolean' && typeof b === 'boolean') {
    result = Number(a) - Number(b)
  } else {
    const left = String(a)
    const right = String(b)
    result =
      left.localeCompare(right, 'fr', { sensitivity: 'base' }) ||
      (left < right ? -1 : left > right ? 1 : 0)
  }

  return term.desc ? -result : result
}

export function sortRows(rows: Row[], order: OrderTerm[]): Row[] {
  if (order.length === 0) return rows

  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      for (const term of order) {
        const result = compareCells(x.row[term.column], y.row[term.column], term)
        if (result !== 0) return result
      }
      return x.index - y.index
    })
    .map((entry) => entry.row)
}

// ---------------------------------------------------------------------------
// Sélection de colonnes et jointures (plusieurs-à-un uniquement)
// ---------------------------------------------------------------------------

export type SelectItem =
  | { kind: 'star' }
  | { kind: 'column'; name: string }
  | { kind: 'embed'; relation: string; items: SelectItem[] }

/** Jointures connues : table → relation → colonne qui porte la clé étrangère. */
export const EMBEDS: Record<string, Record<string, { column: string }>> = {
  grades: { evaluations: { column: 'evaluation_id' }, students: { column: 'student_id' } },
  whatsapp_history: {
    students: { column: 'student_id' },
    classes: { column: 'class_id' },
    evaluations: { column: 'evaluation_id' }
  },
  students: { classes: { column: 'class_id' } },
  evaluations: { classes: { column: 'class_id' } }
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''

  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)

  return parts
}

export function parseSelect(select: string): SelectItem[] | null {
  const items: SelectItem[] = []

  for (const raw of splitTopLevel(select)) {
    const part = raw.trim()
    if (part === '') continue

    if (part === '*') {
      items.push({ kind: 'star' })
      continue
    }

    const open = part.indexOf('(')
    if (open !== -1) {
      if (!part.endsWith(')')) return null
      const relation = part.slice(0, open).trim()
      if (!IDENT.test(relation)) return null
      const inner = parseSelect(part.slice(open + 1, -1))
      if (!inner) return null
      items.push({ kind: 'embed', relation, items: inner })
      continue
    }

    // Alias (a:b), conversion (a::int), JSON (a->b)… : non gérés.
    if (!IDENT.test(part)) return null
    items.push({ kind: 'column', name: part })
  }

  return items.length > 0 ? items : null
}

/** Renvoie la ligne projetée, ou `undefined` si la sélection n'est pas gérée. */
function projectRow(
  table: string,
  row: Row,
  items: SelectItem[],
  getTable: (name: string) => Row[] | null
): Row | undefined {
  const out: Row = {}

  for (const item of items) {
    if (item.kind === 'star') {
      Object.assign(out, row)
    } else if (item.kind === 'column') {
      out[item.name] = row[item.name] === undefined ? null : row[item.name]
    } else {
      const relation = EMBEDS[table]?.[item.relation]
      if (!relation) return undefined

      const targetRows = getTable(item.relation)
      if (!targetRows) return undefined

      const foreignKey = row[relation.column]
      const target =
        foreignKey === null || foreignKey === undefined
          ? null
          : targetRows.find((candidate) => candidate.id === foreignKey) ?? null

      if (target === null) {
        out[item.relation] = null
      } else {
        const projected = projectRow(item.relation, target, item.items, getTable)
        if (projected === undefined) return undefined
        out[item.relation] = projected
      }
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Vues calculées par le serveur, recalculées ici à l'identique
// ---------------------------------------------------------------------------

export const VIEW_TABLES = new Set(['student_averages', 'student_rankings', 'evaluation_stats'])

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function computeStudentAverages(getTable: (name: string) => Row[] | null): Row[] | null {
  const grades = getTable('grades')
  const evaluations = getTable('evaluations')
  const students = getTable('students')
  if (!grades || !evaluations || !students) return null

  const evaluationById = new Map(evaluations.map((e) => [e.id, e]))
  const studentById = new Map(students.map((s) => [s.id, s]))

  const groups = new Map<
    unknown,
    { weighted: number; weights: number; count: number; student: Row }
  >()

  for (const grade of grades) {
    const evaluation = evaluationById.get(grade.evaluation_id)
    const student = studentById.get(grade.student_id)
    if (!evaluation || !student) continue // jointure interne : ligne ignorée

    let group = groups.get(grade.student_id)
    if (!group) {
      group = { weighted: 0, weights: 0, count: 0, student }
      groups.set(grade.student_id, group)
    }

    const score = toNumber(grade.score)
    if (score !== null) {
      const coefficient = toNumber(evaluation.coefficient) ?? 0
      group.weighted += score * coefficient
      group.weights += coefficient
      group.count += 1
    }
  }

  return Array.from(groups.entries()).map(([studentId, group]) => ({
    student_id: studentId,
    class_id: group.student.class_id,
    teacher_id: group.student.teacher_id,
    average: group.weights !== 0 ? round2(group.weighted / group.weights) : null,
    nb_notes: group.count
  }))
}

function computeStudentRankings(getTable: (name: string) => Row[] | null): Row[] | null {
  const averages = computeStudentAverages(getTable)
  if (!averages) return null

  return averages.map((row) => {
    const average = row.average as number | null
    // rank() : 1 + nombre d'élèves de la même classe strictement mieux classés (valeur nulle en dernier).
    const better = averages.filter((other) => {
      if (other.class_id !== row.class_id) return false
      const otherAverage = other.average as number | null
      if (average === null) return otherAverage !== null
      return otherAverage !== null && otherAverage > average
    }).length

    return { ...row, rank: better + 1 }
  })
}

function computeEvaluationStats(getTable: (name: string) => Row[] | null): Row[] | null {
  const grades = getTable('grades')
  const evaluations = getTable('evaluations')
  if (!grades || !evaluations) return null

  const gradesByEvaluation = new Map<unknown, Row[]>()
  for (const grade of grades) {
    const list = gradesByEvaluation.get(grade.evaluation_id)
    if (list) list.push(grade)
    else gradesByEvaluation.set(grade.evaluation_id, [grade])
  }

  return evaluations.map((evaluation) => {
    const list = gradesByEvaluation.get(evaluation.id) ?? []
    const scores = list
      .map((grade) => toNumber(grade.score))
      .filter((score): score is number => score !== null)

    return {
      evaluation_id: evaluation.id,
      class_id: evaluation.class_id,
      teacher_id: evaluation.teacher_id,
      class_average:
        scores.length > 0 ? round2(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null,
      best_score: scores.length > 0 ? Math.max(...scores) : null,
      lowest_score: scores.length > 0 ? Math.min(...scores) : null,
      nb_graded: scores.length,
      nb_absent: list.filter((grade) => grade.is_absent === true).length
    }
  })
}

export function computeView(name: string, getTable: (table: string) => Row[] | null): Row[] | null {
  if (name === 'student_averages') return computeStudentAverages(getTable)
  if (name === 'student_rankings') return computeStudentRankings(getTable)
  if (name === 'evaluation_stats') return computeEvaluationStats(getTable)
  return null
}

// ---------------------------------------------------------------------------
// Exécution d'une requête de lecture
// ---------------------------------------------------------------------------

export interface LocalRequest {
  table: string
  method: 'GET' | 'HEAD'
  search: string
  accept: string
  prefer: string
}

export interface LocalResult {
  status: number
  body: string
  contentRange: string
  contentType: string
}

export function runLocalQuery(
  request: LocalRequest,
  getTable: (name: string) => Row[] | null
): LocalResult | null {
  const query = parseQuery(request.search)
  if (query.unsupported) return null

  const source = VIEW_TABLES.has(request.table)
    ? computeView(request.table, getTable)
    : getTable(request.table)
  if (!source) return null

  const items = parseSelect(query.select)
  if (!items) return null

  const matching = sortRows(
    source.filter((row) => matchRow(row, query.filters)),
    query.order
  )
  const total = matching.length

  const end = query.limit === null ? undefined : query.offset + query.limit
  const windowRows = matching.slice(query.offset, end)

  const projected: Row[] = []
  for (const row of windowRows) {
    const result = projectRow(request.table, row, items, getTable)
    if (result === undefined) return null
    projected.push(result)
  }

  const countRequested = /count=(exact|planned|estimated)/.test(request.prefer)
  const range =
    projected.length > 0
      ? `${query.offset}-${query.offset + projected.length - 1}`
      : '*'
  const contentRange = `${range}/${countRequested ? total : '*'}`

  if (request.method === 'HEAD') {
    return { status: 200, body: '', contentRange, contentType: 'application/json; charset=utf-8' }
  }

  if (/vnd\.pgrst\.object/.test(request.accept)) {
    if (projected.length !== 1) {
      return {
        status: 406,
        body: JSON.stringify({
          code: 'PGRST116',
          details: `The result contains ${projected.length} rows`,
          hint: null,
          message: 'JSON object requested, multiple (or no) rows returned'
        }),
        contentRange,
        contentType: 'application/json; charset=utf-8'
      }
    }

    return {
      status: 200,
      body: JSON.stringify(projected[0]),
      contentRange,
      contentType: 'application/vnd.pgrst.object+json; charset=utf-8'
    }
  }

  return {
    status: 200,
    body: JSON.stringify(projected),
    contentRange,
    contentType: 'application/json; charset=utf-8'
  }
}

// ---------------------------------------------------------------------------
// Création de lignes : identifiants et valeurs par défaut du serveur
// ---------------------------------------------------------------------------

/** Tables dont la clé « id » est un uuid que le navigateur peut fournir lui-même. */
export const ID_TABLES = new Set([
  'classes',
  'students',
  'evaluations',
  'grades',
  'whatsapp_history',
  'scan_history',
  'exports',
  'notifications',
  'parents',
  'message_templates',
  'bulletin_student_records'
])

const DEFAULTS: Record<string, Row> = {
  classes: { is_archived: false, period_count: 3 },
  students: { gender: null, parent_whatsapp: null, note: null, matricule: null, is_active: true },
  evaluations: { coefficient: 1, max_score: 20, is_published: false, period: 1 },
  grades: { score: null, is_absent: false, source: 'manual', scan_history_id: null },
  whatsapp_history: {
    status: 'pending',
    share_method: null,
    error_message: null,
    class_id: null,
    evaluation_id: null
  },
  bulletin_entries: { data: {} },
  bulletin_templates: { data: {} },
  pp_averages: { period: 1, kind: 'matiere', coef: 1, teacher_name: null, averages: {} },
  bulletin_student_records: {
    period: 1,
    conduct: '',
    appreciation: '',
    council_decision: '',
    attitudes: '',
    parent_response: ''
  }
}

const TIMESTAMPS: Record<string, string[]> = {
  classes: ['created_at', 'updated_at'],
  students: ['created_at', 'updated_at'],
  evaluations: ['created_at', 'updated_at'],
  grades: ['created_at', 'updated_at'],
  bulletin_student_records: ['created_at', 'updated_at'],
  bulletin_entries: ['updated_at'],
  bulletin_templates: ['updated_at'],
  pp_averages: ['updated_at'],
  whatsapp_history: ['sent_at']
}

/** Tables dont la colonne user_id vaut par défaut l'utilisateur connecté (auth.uid()). */
const USER_ID_TABLES = new Set(['bulletin_entries', 'bulletin_templates', 'pp_averages'])

export function newUuid(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function localDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function isPlainObject(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Ajoute un identifiant aux lignes à créer qui n'en ont pas (corps JSON de la requête). */
export function injectIds(bodyText: string): string {
  try {
    const parsed: unknown = JSON.parse(bodyText)

    if (Array.isArray(parsed)) {
      return JSON.stringify(
        parsed.map((item) =>
          isPlainObject(item) && item.id === undefined ? { ...item, id: newUuid() } : item
        )
      )
    }
    if (isPlainObject(parsed) && parsed.id === undefined) {
      return JSON.stringify({ ...parsed, id: newUuid() })
    }
  } catch {
    // Corps illisible : on le laisse tel quel.
  }
  return bodyText
}

/** Reconstitue les lignes complètes telles que le serveur les aurait créées. */
export function buildInsertRows(table: string, input: unknown[], userId: string, now: Date): Row[] {
  const nowIso = now.toISOString()

  return input.filter(isPlainObject).map((provided) => {
    const row: Row = { ...(DEFAULTS[table] ?? {}), ...provided }

    if (table === 'evaluations' && row.eval_date === undefined) row.eval_date = localDate(now)
    if (USER_ID_TABLES.has(table) && row.user_id === undefined) row.user_id = userId
    if (row.id === undefined) row.id = newUuid()

    for (const column of TIMESTAMPS[table] ?? []) {
      if (row[column] === undefined) row[column] = nowIso
    }

    return row
  })
}

export function isPlainRow(value: unknown): value is Row {
  return isPlainObject(value)
}
