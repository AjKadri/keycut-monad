import type { Metadata } from 'next'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './globals.css'
import { SiteLayout } from '../components/site-layout'

export const metadata: Metadata = {
  title: 'Keycut | Monad approvals',
  description: 'See who can spend from a Monad wallet and revoke unwanted token approvals.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SiteLayout>{children}</SiteLayout></body></html>
}
