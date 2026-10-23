import { useEffect, useState } from 'react'

/** Bandeau affiché en haut de l'application tant que l'appareil n'a pas internet. */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online) return null

  return (
    <div
      role="status"
      className="bg-amber-500 px-3 py-1.5 text-center text-xs font-medium text-white sm:text-sm"
    >
      Mode hors ligne : les données affichées sont celles de votre dernière connexion. Les notes
      saisies sont gardées sur cet appareil ; les autres modifications demandent internet.
    </div>
  )
}
