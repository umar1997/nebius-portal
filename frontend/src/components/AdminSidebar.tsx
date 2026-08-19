import { NavLink, useNavigate, Link } from 'react-router-dom'
import { LayoutDashboard, Users, Shield, LogOut, ArrowLeft } from 'lucide-react'
import { clsx } from 'clsx'
import { useAdminStore } from '../stores/useAdminStore'
import { toast } from '../stores/useToastStore'

interface AdminSidebarProps {
  pendingCount?: number
}

export default function AdminSidebar({ pendingCount = 0 }: AdminSidebarProps) {
  const { clearAdminToken } = useAdminStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    clearAdminToken()
    toast.info('Admin signed out')
    navigate('/admin')
  }

  const navItems = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/users', icon: Users, label: 'Users', badge: pendingCount },
  ]

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-slate-800 bg-slate-900">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-800 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 ring-1 ring-violet-500/40">
          <Shield className="h-4 w-4 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-50 leading-tight">Admin Panel</p>
          <p className="text-[10px] text-slate-500 leading-tight">Nebius Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 pt-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer',
                isActive
                  ? 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              )
            }
          >
            <span className="flex items-center gap-3">
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {label}
            </span>
            {badge !== undefined && badge > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/30">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-slate-800 p-3 space-y-1">
        <Link
          to="/"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all duration-150 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to Portal
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
