'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV = [
  { href: '/', label: '대시보드' },
  { href: '/whisky', label: '🍶 노트' },
  { href: '/prices', label: '🏷️ 시세' },
  { href: '/ranking', label: '🏆 순위' },
  { href: '/corkage', label: '🍽️ 콜키지' },
  { href: '/accessory', label: '🍷 액세서리' },
  { href: '/glossary', label: '📖 용어사전' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const navLinks = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map(({ href, label }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href + '/'))
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={[
              'rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-neutral-100 font-medium text-neutral-900'
                : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900',
            ].join(' ')}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* 모바일 상단 바 */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
        <p className="text-base font-semibold text-neutral-900">🍶 my-bar</p>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
          aria-label="메뉴"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setOpen(false)} />
          <aside className="fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-neutral-200 bg-white px-4 py-6 md:hidden">
            <p className="mb-4 text-base font-semibold text-neutral-900">🍶 my-bar</p>
            {navLinks}
          </aside>
        </>
      )}

      {/* PC 사이드바 */}
      <aside className="hidden md:flex h-screen w-52 flex-col border-r border-neutral-200 bg-white px-4 py-6">
        <p className="mb-4 text-base font-semibold text-neutral-900">🍶 my-bar</p>
        {navLinks}
      </aside>
    </>
  )
}
