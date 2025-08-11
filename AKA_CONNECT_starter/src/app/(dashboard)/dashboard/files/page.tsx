
import dynamic from 'next/dynamic'
const FileUploader = dynamic(() => import('@/components/FileUploader'), { ssr:false })

export default function FilesPage() {
  return (
    <div>
      <h1>Fichiers</h1>
      <p>Partage de documents par client.</p>
      <div className="card">
        <FileUploader />
      </div>
    </div>
  )
}
