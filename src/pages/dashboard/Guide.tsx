import { Link } from 'react-router-dom'
import {
  School,
  Users,
  ClipboardList,
  FileText,
  MessageCircle,
  WifiOff,
  UserCircle,
  Lightbulb,
  type LucideIcon
} from 'lucide-react'

interface GuideSection {
  id: string
  title: string
  icon: LucideIcon
  intro: string
  steps: string[]
  tip?: string
  link?: { to: string; label: string }
}

const quickStart = [
  'Créez une classe.',
  'Ajoutez vos élèves.',
  'Créez une évaluation.',
  'Saisissez les notes.',
  'Imprimez les bulletins.'
]

const sections: GuideSection[] = [
  {
    id: 'classes',
    title: '1. Créer une classe',
    icon: School,
    intro: 'Une classe regroupe vos élèves, vos évaluations et vos bulletins.',
    steps: [
      'Dans le menu, touchez « Classes ».',
      'Touchez « Nouvelle classe ».',
      'Renseignez le nom de la classe (ex : 6ème A) puis enregistrez.',
      'Touchez la classe pour l’ouvrir : tout votre travail se fait à l’intérieur.'
    ],
    link: { to: '/classes', label: 'Aller aux classes' }
  },
  {
    id: 'eleves',
    title: '2. Ajouter les élèves',
    icon: Users,
    intro: 'Trois méthodes, choisissez la plus simple pour vous. Dans la classe, repérez la section « Élèves ».',
    steps: [
      'Un par un : touchez « Ajouter », saisissez le nom et le prénom, puis validez.',
      'Coller une liste : copiez la liste depuis Excel, Word ou WhatsApp, touchez « Coller une liste », collez-la, vérifiez l’aperçu puis confirmez l’import.',
      'Importer un fichier : touchez « Importer » et choisissez un fichier Excel (.xlsx, .xls), CSV, Word (.docx) ou PDF.',
      'Avant de confirmer un import, lisez toujours l’aperçu : corrigez ou retirez les lignes incorrectes.'
    ],
    tip: 'Un PDF qui est une simple photo (document scanné) ne peut pas être lu. Utilisez un PDF dont on peut sélectionner le texte, ou collez la liste.'
  },
  {
    id: 'evaluations',
    title: '3. Créer une évaluation',
    icon: ClipboardList,
    intro: 'Interrogation, devoir ou composition : chaque évaluation a son titre, sa date et sa note maximale.',
    steps: [
      'Dans la classe, section « Évaluations », touchez « Nouvelle évaluation ».',
      'Saisissez le titre (ex : Interro n°3), la matière, le type, la date et la note maximale (ex : 20).',
      'Validez : l’évaluation apparaît dans la liste.'
    ],
    link: { to: '/evaluations', label: 'Voir les évaluations' }
  },
  {
    id: 'notes',
    title: '4. Saisir les notes',
    icon: ClipboardList,
    intro: 'Ouvrez l’évaluation : la liste de vos élèves s’affiche, avec une case de note pour chacun.',
    steps: [
      'Touchez la case en face du nom de l’élève et tapez sa note (les décimales comme 12,5 sont acceptées).',
      'Si un élève est absent, marquez-le absent au lieu de lui mettre 0.',
      'Une note supérieure à la note maximale est refusée : corrigez-la.',
      'Touchez « Enregistrer » pour sauvegarder toutes les notes.'
    ],
    tip: 'Les moyennes sont calculées automatiquement : vous n’avez aucun calcul à faire.'
  },
  {
    id: 'bulletins',
    title: '5. Produire les bulletins',
    icon: FileText,
    intro: 'Les bulletins se construisent à partir des notes déjà saisies.',
    steps: [
      'Dans le menu, touchez « Bulletins ».',
      'Choisissez la classe, la période et le modèle (ou laissez « Modèle automatique »).',
      'Vérifiez l’aperçu et complétez les appréciations si besoin.',
      'Touchez « Imprimer / PDF » pour un élève, ou « Imprimer toute la classe » pour tous.'
    ],
    link: { to: '/bulletins', label: 'Aller aux bulletins' }
  },
  {
    id: 'whatsapp',
    title: '6. Informer les parents par WhatsApp',
    icon: MessageCircle,
    intro: 'Envoyez les résultats aux parents sans recopier les numéros.',
    steps: [
      'Dans le menu, touchez « WhatsApp ».',
      'Renseignez le numéro du parent de chaque élève (si ce n’est pas déjà fait).',
      'Sélectionnez les élèves concernés.',
      'Touchez « Envoyer aux … » : WhatsApp s’ouvre avec le message prêt, il ne reste qu’à l’envoyer.'
    ],
    link: { to: '/whatsapp', label: 'Aller à WhatsApp' }
  },
  {
    id: 'hors-ligne',
    title: '7. Travailler sans internet',
    icon: WifiOff,
    intro: 'PROFNOTE continue de fonctionner quand la connexion coupe.',
    steps: [
      'Un bandeau « Mode hors ligne » s’affiche : continuez à saisir vos notes normalement.',
      'Vos modifications sont gardées sur le téléphone.',
      'Au retour d’internet, elles sont envoyées automatiquement. Vous pouvez aussi toucher « Envoyer maintenant » dans le bandeau.'
    ],
    tip: 'Ouvrez l’application au moins une fois avec internet avant de partir en zone sans réseau, pour qu’elle prépare le mode hors ligne.'
  },
  {
    id: 'profil',
    title: '8. Mon profil',
    icon: UserCircle,
    intro: 'Votre nom, votre établissement et votre téléphone apparaissent dans l’application.',
    steps: [
      'Touchez « Profil » en bas du menu.',
      'Modifiez vos informations puis touchez « Enregistrer ».'
    ],
    link: { to: '/profil', label: 'Ouvrir mon profil' }
  }
]

export default function Guide() {
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-primary-800">
          Guide d’utilisation
        </h1>
        <p className="text-sm text-primary-500">
          Tout ce qu’il faut savoir pour utiliser PROFNOTE, étape par étape.
        </p>
      </div>

      <div className="card">
        <h2 className="font-semibold text-primary-800 mb-3">
          En bref : 5 étapes
        </h2>
        <ol className="flex flex-wrap gap-2">
          {quickStart.map((label, i) => (
            <li
              key={label}
              className="flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1.5 text-sm text-primary-700"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">
                {i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      <nav className="card" aria-label="Sommaire du guide">
        <h2 className="font-semibold text-primary-800 mb-2">Sommaire</h2>
        <ul className="grid gap-1 sm:grid-cols-2 text-sm">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-primary-600 hover:underline"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {sections.map((s) => {
        const Icon = s.icon
        return (
          <section key={s.id} id={s.id} className="card scroll-mt-4">
            <h2 className="flex items-center gap-2 font-semibold text-primary-800">
              <Icon size={18} className="text-primary-500" />
              {s.title}
            </h2>
            <p className="mt-1 text-sm text-primary-500">{s.intro}</p>

            <ol className="mt-3 space-y-2">
              {s.steps.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm text-primary-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            {s.tip && (
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <Lightbulb size={16} className="mt-0.5 shrink-0" />
                <p>{s.tip}</p>
              </div>
            )}

            {s.link && (
              <Link
                to={s.link.to}
                className="mt-3 inline-block text-sm font-medium text-primary-600 hover:underline"
              >
                {s.link.label} →
              </Link>
            )}
          </section>
        )
      })}
    </div>
  )
}
