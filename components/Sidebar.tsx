'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/actions/auth'
import type { User } from '@/types'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/clients', label: 'Clients & CRM', icon: '🏢' },
  { href: '/projects', label: 'Projects', icon: '📁' },
  { href: '/tasks', label: 'Tasks', icon: '✓' },
  { href: '/time', label: 'Time Tracking', icon: '⏱' },
  { href: '/social', label: 'Social Media', icon: '📱' },
  { href: '/tickets', label: 'Support Tickets', icon: '🎫' },
  { href: '/invoices', label: 'Invoices', icon: '💳' },
  { href: '/services', label: 'Services', icon: '📋' },
]

const adminNavItems = [
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar({ user }: { user: User | null }) {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-[#1A1A1A] flex flex-col h-screen flex-shrink-0">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="text-[#E8611A] font-bold text-xs tracking-widest uppercase mb-0.5">
          Marmoset Digital
        </div>
        <div className="text-white font-bold text-lg leading-tight">Agency OS</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          {navItems.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-[#E8611A] text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>

        {user?.role === 'admin' && (
          <div className="mt-6 pt-4 border-t border-white/10 space-y-0.5">
            {adminNavItems.map(item => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-[#E8611A] text-white font-medium'
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="text-base w-5 text-center">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* User profile */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-[#E8611A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) ?? 'U'}
          </div>
          <div className="min-w-0">
            <div className="text-white text-sm font-medium truncate">{user?.full_name ?? 'User'}</div>
            <div className="text-gray-500 text-xs capitalize">{user?.role?.replace('_', ' ') ?? ''}</div>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full text-left text-gray-500 hover:text-white text-xs px-2 py-1.5 rounded hover:bg-white/10 transition"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
