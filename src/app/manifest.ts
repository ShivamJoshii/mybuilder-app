import type { MetadataRoute } from 'next'

/** Installable on phones and tablets so field crews can open MyBuilder like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyBuilder',
    short_name: 'MyBuilder',
    description: 'Construction project management for Canadian home builders.',
    start_url: '/summary',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1d4ed8',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
