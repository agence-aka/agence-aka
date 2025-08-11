
import dynamic from 'next/dynamic'
const Calendar = dynamic(() => import('@/components/Calendar'), { ssr:false })

export default function ClientCalendar({ params }: { params: { client: string } }) {
  return (
    <div>
      <h1>Calendrier — {params.client}</h1>
      <div className="card">
        <Calendar clientId={params.client} />
      </div>
    </div>
  )
}
