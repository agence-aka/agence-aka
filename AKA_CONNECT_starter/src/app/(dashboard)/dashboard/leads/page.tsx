import dynamic from 'next/dynamic'
const LeadsDashboard = dynamic(() => import('@/components/leads/LeadsDashboard'), { ssr: false })

export default function LeadsPage() {
  return <LeadsDashboard />
}
