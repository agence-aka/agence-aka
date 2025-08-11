
import './styles/globals.css'
import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'AKA CONNECT',
  description: 'Plateforme client pour agence média'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
      </body>
    </html>
  )
}
