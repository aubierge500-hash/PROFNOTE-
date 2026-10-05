import { useEffect, useMemo, useState } from 'react'
import {
  MessageCircle,
  Search,
  Users,
  Send,
  History,
  RefreshCw
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'

interface SchoolClass {
  id: string
  name: string
}

interface Student {
  id: string
  class_id: string
  last_name: string
  first_name: string
  parent_whatsapp: string | null
  class_name: string
}

function normalizeBeninWhatsApp(
  value: string
): string | null {
  const digits = value.replace(/\D/g, '')

  if (!digits) return null

  let local = digits.startsWith('229')
    ? digits.slice(3)
    : digits

  if (local.length === 8) {
    local = `01${local}`
  }

  if (!/^01\d{8}$/.test(local)) {
    return null
  }

  return `+229${local}`
}

function buildMessage(
  student: Student,
  message: string
) {
  return (
    `Bonjour, message concernant ${student.first_name} ${student.last_name} ` +
    `(classe ${student.class_name}).\n\n${message}`
  )
}

const templates = [
  {
    label: 'Information générale',
    text: 'Nous vous transmettons une information concernant votre enfant.'
  },
  {
    label: 'Réunion',
    text: 'Nous vous informons qu’une réunion de parents est prévue. Merci de prendre les dispositions nécessaires.'
  },
  {
    label: 'Absence',
    text: 'Nous vous informons que votre enfant a été absent. Merci de bien vouloir nous contacter si nécessaire.'
  },
  {
    label: 'Travail scolaire',
    text: 'Nous vous invitons à veiller au suivi du travail scolaire de votre enfant.'
  }
]

export default function WhatsApp() {
  const { user } = useAuth()

  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [students, setStudents] = useState<Student[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [classFilter, setClassFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [selectedStudents, setSelectedStudents] =
    useState<string[]>([])

  const [message, setMessage] = useState('')

  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  async function loadData() {
    if (!user) return

    setLoading(true)
    setError('')

    try {
      const { data: classData, error: classError } =
        await supabase
          .from('classes')
          .select('id, name')
          .eq('teacher_id', user.id)
          .order('name')

      if (classError) throw classError

      const loadedClasses: SchoolClass[] =
        classData ?? []

      setClasses(loadedClasses)

      const { data: studentData, error: studentError } =
        await supabase
          .from('students')
          .select(
            'id, class_id, last_name, first_name, parent_whatsapp'
          )
          .eq('teacher_id', user.id)
          .eq('is_active', true)
          .order('last_name')
          .order('first_name')

      if (studentError) throw studentError

      const classMap = new Map(
        loadedClasses.map((item) => [
          item.id,
          item.name
        ])
      )

      const loadedStudents: Student[] =
        (studentData ?? []).map((student: any) => ({
          id: student.id,
          class_id: student.class_id,
          last_name: student.last_name,
          first_name: student.first_name,
          parent_whatsapp:
            student.parent_whatsapp ?? null,
          class_name:
            classMap.get(student.class_id) ?? ''
        }))

      setStudents(loadedStudents)
    } catch (err) {
      console.error(
        '[WhatsApp] Erreur chargement :',
        err
      )

      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de charger les données WhatsApp.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [user])

  async function refresh() {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  const studentsWithWhatsApp = useMemo(
    () =>
      students.filter(
        (student) =>
          Boolean(
            normalizeBeninWhatsApp(
              student.parent_whatsapp ?? ''
            )
          )
      ),
    [students]
  )

  const filteredStudents = useMemo(() => {
    const searchValue = search
      .trim()
      .toLowerCase()

    return studentsWithWhatsApp.filter(
      (student) => {
        const matchesClass =
          classFilter === 'all' ||
          student.class_id === classFilter

        const fullName =
          `${student.last_name} ${student.first_name}`
            .toLowerCase()

        const matchesSearch =
          !searchValue ||
          fullName.includes(searchValue) ||
          student.class_name
            .toLowerCase()
            .includes(searchValue) ||
          (student.parent_whatsapp ?? '')
            .includes(searchValue)

        return matchesClass && matchesSearch
      }
    )
  }, [
    studentsWithWhatsApp,
    classFilter,
    search
  ])

  function toggleStudent(studentId: string) {
    setSelectedStudents((current) =>
      current.includes(studentId)
        ? current.filter(
            (id) => id !== studentId
          )
        : [...current, studentId]
    )

    setResult('')
    setError('')
  }

  function selectAll() {
    setSelectedStudents(
      filteredStudents.map(
        (student) => student.id
      )
    )

    setResult('')
  }

  function clearSelection() {
    setSelectedStudents([])
    setResult('')
  }

  function openWhatsApp(student: Student) {
    setError('')
    setResult('')

    const number =
      normalizeBeninWhatsApp(
        student.parent_whatsapp ?? ''
      )

    if (!number) {
      setError(
        `Le numéro WhatsApp du parent de ${student.first_name} ${student.last_name} est invalide.`
      )
      return
    }

    const text =
      message.trim() ||
      'Nous vous contactons au sujet de votre enfant.'

    const personalized =
      buildMessage(student, text)

    const url =
      `https://wa.me/${number.replace(/\D/g, '')}` +
      `?text=${encodeURIComponent(personalized)}`

    window.open(url, '_blank')

    void saveHistory(
      student,
      personalized
    )
  }

  async function saveHistory(
    student: Student,
    personalizedMessage: string
  ) {
    if (!user) return

    const number =
      normalizeBeninWhatsApp(
        student.parent_whatsapp ?? ''
      )

    if (!number) return

    const { error: historyError } =
      await supabase
        .from('whatsapp_history')
        .insert({
          teacher_id: user.id,
          student_id: student.id,
          class_id: student.class_id,
          message_type: 'communication_parent',
          message_content:
            personalizedMessage,
          parent_whatsapp: number,
          status: 'sent',
          share_method:
            'wa_link_fallback',
          error_message: null
        })

    if (historyError) {
      console.error(
        '[WhatsApp] Erreur historique :',
        historyError
      )
    }
  }

  async function sendToSelected() {
    setError('')
    setResult('')

    if (!message.trim()) {
      setError(
        'Écrivez d’abord le message à envoyer.'
      )
      return
    }

    if (selectedStudents.length === 0) {
      setError(
        'Sélectionnez au moins un parent.'
      )
      return
    }

    const selected =
      students.filter((student) =>
        selectedStudents.includes(
          student.id
        )
      )

    let opened = 0
    let invalid = 0

    for (const student of selected) {
      const number =
        normalizeBeninWhatsApp(
          student.parent_whatsapp ?? ''
        )

      if (!number) {
        invalid++
        continue
      }

      const personalized =
        buildMessage(
          student,
          message.trim()
        )

      const url =
        `https://wa.me/${number.replace(/\D/g, '')}` +
        `?text=${encodeURIComponent(personalized)}`

      window.open(url, '_blank')

      await saveHistory(
        student,
        personalized
      )

      opened++
    }

    setResult(
      `${opened} conversation${
        opened > 1 ? 's' : ''
      } WhatsApp ouverte${
        opened > 1 ? 's' : ''
      }.`
    )

    if (invalid > 0) {
      setError(
        `${invalid} parent${
          invalid > 1 ? 's' : ''
        } ignoré${
          invalid > 1 ? 's' : ''
        } : numéro WhatsApp invalide.`
      )
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-primary-400">
          Chargement de WhatsApp…
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle
              size={24}
              className="text-primary-600"
            />

            <h1 className="text-xl font-bold text-primary-800">
              WhatsApp
            </h1>
          </div>

          <p className="text-sm text-primary-500 mt-1">
            Communication avec les parents d’élèves
          </p>
        </div>

        <div className="flex gap-2">
          <a
            href="/whatsapp-historique"
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <History size={16} />
            Historique
          </a>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={
                refreshing
                  ? 'animate-spin'
                  : ''
              }
            />
            Actualiser
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card">
          <p className="text-xs text-primary-400">
            Élèves
          </p>

          <p className="text-xl font-bold text-primary-800 mt-1">
            {students.length}
          </p>
        </div>

        <div className="card">
          <p className="text-xs text-primary-400">
            Parents avec WhatsApp
          </p>

          <p className="text-xl font-bold text-primary-800 mt-1">
            {studentsWithWhatsApp.length}
          </p>
        </div>

        <div className="card">
          <p className="text-xs text-primary-400">
            Sélectionnés
          </p>

          <p className="text-xl font-bold text-primary-800 mt-1">
            {selectedStudents.length}
          </p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400"
            />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Rechercher un élève ou une classe…"
              className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm"
            />
          </div>

          <select
            value={classFilter}
            onChange={(event) =>
              setClassFilter(event.target.value)
            }
            className="border rounded-lg px-3 py-2.5 text-sm"
          >
            <option value="all">
              Toutes les classes
            </option>

            {classes.map((schoolClass) => (
              <option
                key={schoolClass.id}
                value={schoolClass.id}
              >
                {schoolClass.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="btn-secondary text-xs"
          >
            Tout sélectionner
          </button>

          <button
            type="button"
            onClick={clearSelection}
            className="btn-secondary text-xs"
          >
            Tout désélectionner
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Users
            size={18}
            className="text-primary-600"
          />

          <h2 className="font-semibold text-primary-800">
            Parents disponibles
          </h2>
        </div>

        {filteredStudents.length === 0 ? (
          <p className="text-sm text-primary-400">
            Aucun parent avec un numéro WhatsApp
            correspondant aux critères.
          </p>
        ) : (
          <div className="space-y-2">
            {filteredStudents.map((student) => {
              const selected =
                selectedStudents.includes(
                  student.id
                )

              return (
                <div
                  key={student.id}
                  className={`border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
                    selected
                      ? 'border-primary-500 bg-primary-50'
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        toggleStudent(
                          student.id
                        )
                      }
                      className="mt-1"
                    />

                    <div>
                      <p className="font-medium text-primary-800">
                        {student.last_name}{' '}
                        {student.first_name}
                      </p>

                      <p className="text-xs text-primary-400">
                        {student.class_name}
                      </p>

                      <p className="text-sm text-primary-600 mt-1">
                        {student.parent_whatsapp}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      openWhatsApp(student)
                    }
                    className="btn-primary flex items-center justify-center gap-2 text-sm"
                  >
                    <MessageCircle size={16} />
                    Message
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold text-primary-800">
            Message
          </h2>

          <p className="text-xs text-primary-400 mt-1">
            Le prénom et le nom de l’élève seront
            automatiquement ajoutés au message.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() =>
                setMessage(template.text)
              }
              className="text-xs px-3 py-1.5 rounded-full bg-primary-50 text-primary-600 hover:bg-primary-100"
            >
              {template.label}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(event) =>
            setMessage(event.target.value)
          }
          rows={5}
          placeholder="Écrivez votre message aux parents…"
          className="w-full border rounded-lg px-3 py-2.5 text-sm resize-y"
        />

        <button
          type="button"
          onClick={() =>
            void sendToSelected()
          }
          className="btn-primary flex items-center justify-center gap-2 w-full md:w-auto"
        >
          <Send size={16} />
          Envoyer aux {selectedStudents.length}{' '}
          parent
          {selectedStudents.length > 1
            ? 's'
            : ''}
        </button>

        {result && (
          <p className="text-sm text-green-600">
            {result}
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}