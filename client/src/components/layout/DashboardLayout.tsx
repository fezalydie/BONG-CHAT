import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-7xl gap-6 px-3 py-4 md:px-6 lg:px-8">
        <Sidebar />
        <main className="flex-1">{children}</main>
      </div>
      <MobileNav />
    </div>
  )
}
