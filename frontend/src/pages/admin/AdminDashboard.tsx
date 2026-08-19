import { useState, useEffect } from 'react'
import { Users, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import AdminSidebar from '../../components/AdminSidebar'
import { User, adminApi } from '../../lib/api'
import { toast } from '../../stores/useToastStore'
import { clsx } from 'clsx'

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchUsers = async () => {
    try {
      const data = await adminApi.getUsers()
      setUsers(data)
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const pending = users.filter((u) => u.status === 'pending')
  const approved = users.filter((u) => u.status === 'approved')
  const rejected = users.filter((u) => u.status === 'rejected')

  const handleApprove = async (user: User) => {
    setActionLoading(user.id + '-approve')
    try {
      await adminApi.approveUser(user.id)
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: 'approved' } : u))
      )
      toast.success(`${user.name} approved`)
    } catch {
      toast.error('Failed to approve user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (user: User) => {
    setActionLoading(user.id + '-reject')
    try {
      await adminApi.rejectUser(user.id)
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: 'rejected' } : u))
      )
      toast.success(`${user.name} rejected`)
    } catch {
      toast.error('Failed to reject user')
    } finally {
      setActionLoading(null)
    }
  }

  const stats = [
    {
      label: 'Total users',
      value: users.length,
      icon: Users,
      color: 'text-slate-400',
      bg: 'bg-slate-800',
    },
    {
      label: 'Pending approval',
      value: pending.length,
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      ring: 'ring-amber-500/20',
    },
    {
      label: 'Approved',
      value: approved.length,
      icon: CheckCircle,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      ring: 'ring-green-500/20',
    },
    {
      label: 'Rejected',
      value: rejected.length,
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      ring: 'ring-red-500/20',
    },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <AdminSidebar pendingCount={pending.length} />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-6">
          <div>
            <h1 className="text-base font-semibold text-slate-100">Dashboard</h1>
            <p className="text-[11px] text-slate-500">User management overview</p>
          </div>
          <Link
            to="/admin/users"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            View all users →
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(({ label, value, icon: Icon, color, bg, ring }) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <div className={clsx('rounded-lg p-1.5', bg, ring && `ring-1 ${ring}`)}>
                    <Icon className={clsx('h-4 w-4', color)} />
                  </div>
                </div>
                <p className="mt-3 text-3xl font-bold text-slate-100">
                  {loading ? '–' : value}
                </p>
              </div>
            ))}
          </div>

          {/* Pending users */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-100">Pending Approval</h2>
                {pending.length > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/30">
                    {pending.length}
                  </span>
                )}
              </div>
              <Link
                to="/admin/users"
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                View all
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              </div>
            ) : pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="mb-2 h-8 w-8 text-green-500/40" />
                <p className="text-sm text-slate-500">No pending requests</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {pending.map((user) => (
                  <li key={user.id} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {new Date(user.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReject(user)}
                        disabled={!!actionLoading}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 ring-1 ring-red-500/25 hover:bg-red-500/10 disabled:opacity-50 transition-all cursor-pointer"
                      >
                        {actionLoading === user.id + '-reject' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(user)}
                        disabled={!!actionLoading}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-green-400 ring-1 ring-green-500/25 hover:bg-green-500/10 disabled:opacity-50 transition-all cursor-pointer"
                      >
                        {actionLoading === user.id + '-approve' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle className="h-3 w-3" />
                        )}
                        Approve
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
