
import dynamic from 'next/dynamic'
const Calendar = dynamic(() => import('@/components/Calendar'), { ssr:false })

export default function CalendarPage() {
  return (
    <div>
      <h1>Calendrier</h1>
      <p>Crée, visualise et partage des événements avec tes clients.</p>
      <div className="card">
        <Calendar />
      </div>
    </div>
  )
}
