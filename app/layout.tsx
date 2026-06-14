import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tickr',
  description: 'Local task management for software engineers',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-color-mode="dark" className="h-full">
      <body className="bg-surface-900 text-surface-100 h-full antialiased">{children}</body>
    </html>
  )
}
