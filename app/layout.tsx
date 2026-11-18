import type { Metadata, Viewport } from 'next';
import './globals.css';
import { OfflineClient } from './hub/offline-client';
export const metadata:Metadata={title:'Learning Hub',description:'Học có hướng. Nghiên cứu có dấu vết. Một không gian cho cả nhà.',referrer:'strict-origin',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg'}};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f1ede6' },
    { media: '(prefers-color-scheme: dark)', color: '#25211c' },
  ],
};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}<OfflineClient /></body></html>}
