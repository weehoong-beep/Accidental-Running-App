import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'

const TABS = [
  { to: '/', label: 'Today', icon: 'M4 12l8-8 8 8M6 10v10h12V10' },
  { to: '/weekly', label: 'Weekly', icon: 'M4 5h16M4 10h16M4 15h10M4 20h6' },
  { to: '/calendar', label: 'Calendar', icon: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4' },
  { to: '/training', label: 'Runs', icon: 'M4 16l4-6 4 3 6-9' },
  { to: '/settings', label: 'Settings', icon: 'M12 8a4 4 0 100 8 4 4 0 000-8zM4 12h2m12 0h2M12 4v2m0 12v2' }
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 safe-bottom border-t border-white/5 bg-bg-950/85 backdrop-blur-lg">
      <div className="mx-auto max-w-md flex items-stretch justify-between px-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-white' : 'text-slate-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="nav-glow"
                    className="absolute -top-px h-0.5 w-8 rounded-full bg-accent-gradient"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
