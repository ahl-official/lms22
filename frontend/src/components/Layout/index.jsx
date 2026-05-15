import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import {
  LayoutDashboard, BookOpen, BarChart2,
  GraduationCap, LogOut, Menu, X, Bell,
  Tag, Mic, Settings, MessageCircle, Briefcase, TrendingUp,
  History,
} from 'lucide-react'

const NAV = {
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/students', label: 'Students', icon: GraduationCap },
    { to: '/admin/trainers', label: 'Trainers', icon: Briefcase },
    { to: '/admin/courses', label: 'Courses', icon: BookOpen },
    { to: '/admin/progress', label: 'Student Progress', icon: TrendingUp },
    { to: '/admin/history', label: 'Student History', icon: History },
    { to: '/admin/categories', label: 'Roles', icon: Tag },
    { to: '/admin/ai-settings', label: 'AI Settings', icon: Settings },
    { to: '/admin/whatsapp', label: 'WhatsApp Settings', icon: MessageCircle },
  ],
  trainer: [
    { to: '/trainer', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/trainer/trainees', label: 'My Students', icon: GraduationCap },
    { to: '/trainer/history', label: 'Student History', icon: History },
    { to: '/trainer/analytics', label: 'Activities Review', icon: BarChart2 },
  ],
  trainee: [
    { to: '/trainee', label: 'My Courses', icon: BookOpen, end: true },
    { to: '/trainee/history', label: 'My History', icon: History },
  ],
}

const ROLE_COLOR = {
  admin: 'bg-brand-500',
  trainer: 'bg-coral-500',
  trainee: 'bg-sage-600',
}

export default function Layout() {
  const { user, logout, primaryRole } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const role = primaryRole()
  const navItems = NAV[role] || []

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {open && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed lg:static z-30 h-full w-64 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        style={{ background: 'var(--sidebar-bg)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0">
            <Mic size={18} className="text-white" />
          </div>
          <span className="font-display font-bold text-white text-lg">AHL Training</span>
          <button className="ml-auto lg:hidden text-white/60 hover:text-white" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-6 py-3">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full text-white ${ROLE_COLOR[role] || 'bg-gray-500'}`}>
            {role?.toUpperCase()}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-white/50 text-xs truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/80 hover:bg-red-500 text-white text-sm font-semibold transition-all"
          >
            <LogOut size={15} /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4 flex-shrink-0">
          <button className="lg:hidden text-gray-500 hover:text-gray-700" onClick={() => setOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="flex-1" />
          <button className="relative w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
            <Bell size={17} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:inline">{user?.name}</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
