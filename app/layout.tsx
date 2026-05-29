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
      <body className="h-full bg-zinc-900 text-zinc-100 antialiased">{children}</body>
    </html>
  )
}
