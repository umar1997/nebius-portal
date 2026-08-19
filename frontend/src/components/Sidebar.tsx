import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Cpu, LogOut, ChevronLeft, ChevronRight, Zap, Shield } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../stores/useAuthStore'
import { authApi } from '../lib/api'
import { toast } from '../stores/useToastStore'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    const rt = localStorage.getItem('refreshToken')
    if (rt) {
      await authApi.logout(rt).catch(() => {})
      localStorage.removeItem('refreshToken')
    }
    clearAuth()
    toast.info('Signed out')
    navigate('/login')
  }

  const navItems = [
    { to: '/', icon: Cpu, label: 'Applications' },
    ...(user?.role === 'admin'
      ? [{ to: '/admin/dashboard', icon: Shield, label: 'Admin Panel' }]
      : []),
  ]

  return (
    <aside
      className={clsx(
        'relative flex h-screen flex-col border-r border-slate-800 bg-slate-900 transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={clsx('flex h-16 items-center border-b border-slate-800 px-4', collapsed && 'justify-center')}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500/20 ring-1 ring-green-500/40">
            <Zap className="h-4 w-4 text-green-400" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-700 text-slate-50 leading-tight font-bold">Nebius Portal</p>
              <p className="text-[10px] text-slate-500 leading-tight">GPU App Gateway</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 pt-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer',
                isActive
                  ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                collapsed && 'justify-center'
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="h-4.5 w-4.5 h-[18px] w-[18px] shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-slate-800 p-3">
        {!collapsed && user && (
          <div className="mb-2 px-2 py-1">
            <p className="text-xs font-semibold text-slate-200 truncate">{user.name}</p>
            <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={clsx(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 cursor-pointer',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer shadow-md"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  )
}
