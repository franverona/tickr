'use client'

import dynamic from 'next/dynamic'

export const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
})

export const MDPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
})
