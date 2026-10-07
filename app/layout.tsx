import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Nhà học — Vũ, Ly & Bột',description:'Học có hướng. Nghiên cứu có dấu vết. Một không gian cho cả nhà.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>}
