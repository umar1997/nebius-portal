import { useState, useEffect, useMemo } from 'react'
import {
  CheckCircle, XCircle, Trash2, Clock, Loader2, Search,
  KeyRound, LayoutGrid, UserPlus, Eye, EyeOff, ShieldCheck, ShieldOff, Users,
} from 'lucide-react'
import { clsx } from 'clsx'
import AdminSidebar from '../../components/AdminSidebar'
import AppPermissionsModal from '../../components/AppPermissionsModal'
import { User, adminApi } from '../../lib/api'
import { toast } from '../../stores/useToastStore'
import { useAdminStore } from '../../stores/useAdminStore'
import { useAuthStore } from '../../stores/useAuthStore'

type StatusFilter = 'all' | User['status']

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    className: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    className: 'bg-green-500/15 text-green-400 ring-1 ring-green-500/25',
    icon: CheckCircle,
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/25',
    icon: XCircle,
  },
}

function useIsSuperAdmin() {
  const { adminToken } = useAdminStore()
  const { user } = useAuthStore()
  return !!adminToken || user?.role === 'superadmin'
}

// ── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({
  isSuperAdmin,
  onClose,
  onCreated,
}: {
  isSuperAdmin: boolean
  onClose: () => void
  onCreated: (user: User) => void
}) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' as 'user' | 'admin' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const { user } = await adminApi.createUser(form)
      toast.success(`${user.name} created and approved`)
      onCreated(user)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-50 w-full max-w-sm animate-slide-up rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Create user</h2>
            <p className="text-xs text-slate-500 mt-0.5">Account is created as approved</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Full name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Name"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email address</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="user@example.com"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                required
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 characters"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(['user', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={clsx(
                    'rounded-xl border py-2 text-xs font-medium transition-all cursor-pointer capitalize',
                    form.role === r
                      ? 'border-violet-500/40 bg-violet-500/15 text-violet-400'
                      : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-500 py-2.5 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create user
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Change Password Modal ─────────────────────────────────────────────────────

function ChangePasswordModal({
  user,
  onClose,
}: {
  user: User
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await adminApi.setUserPassword(user.id, password)
      toast.success(`Password updated for ${user.name}`)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-50 w-full max-w-sm animate-slide-up rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="border-b border-slate-800 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-100">Change password</h2>
          <p className="text-xs text-slate-500 mt-0.5">{user.name} · {user.email}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">New password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                autoFocus
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-500 py-2.5 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Update password
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── AdminUsers Page ───────────────────────────────────────────────────────────

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<User | null>(null)
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null)
  const [permissionsMode, setPermissionsMode] = useState<'approve' | 'edit'>('edit')
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const isSuperAdmin = useIsSuperAdmin()

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

  const pendingCount = useMemo(() => users.filter((u) => u.status === 'pending').length, [users])

  const stats = useMemo(() => [
    { label: 'Total Users',      value: users.length,                                       icon: Users,        color: 'text-slate-400',  bg: 'bg-slate-800',       ring: '' },
    { label: 'Pending Approval', value: users.filter((u) => u.status === 'pending').length,  icon: Clock,        color: 'text-amber-400',  bg: 'bg-amber-500/10',    ring: 'ring-amber-500/20' },
    { label: 'Approved',         value: users.filter((u) => u.status === 'approved').length, icon: CheckCircle,  color: 'text-green-400',  bg: 'bg-green-500/10',    ring: 'ring-green-500/20' },
    { label: 'Rejected',         value: users.filter((u) => u.status === 'rejected').length, icon: XCircle,      color: 'text-red-400',    bg: 'bg-red-500/10',      ring: 'ring-red-500/20' },
  ], [users])

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter
      const q = search.toLowerCase()
      const matchesSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [users, statusFilter, search])

  // Approve immediately then open permissions modal
  const handleApproveClick = async (user: User) => {
    setActionLoading(user.id + '-approve')
    try {
      await adminApi.approveUser(user.id)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: 'approved' } : u)))
      toast.success(`${user.name} approved`)
      setPermissionsMode('approve')
      setPermissionsUser(user)
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
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: 'rejected' } : u)))
      toast.success(`${user.name} rejected`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setActionLoading(confirmDelete.id + '-delete')
    try {
      await adminApi.deleteUser(confirmDelete.id)
      setUsers((prev) => prev.filter((u) => u.id !== confirmDelete.id))
      toast.success(`${confirmDelete.name} deleted`)
      setConfirmDelete(null)
    } catch {
      toast.error('Failed to delete user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRoleToggle = async (user: User) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    setActionLoading(user.id + '-role')
    try {
      const { user: updated } = await adminApi.setUserRole(user.id, newRole)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: updated.role } : u)))
      toast.success(`${user.name} is now ${updated.role}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to change role')
    } finally {
      setActionLoading(null)
    }
  }

  const tabs: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <AdminSidebar pendingCount={pendingCount} />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-6">
          <div>
            <h1 className="text-base font-semibold text-slate-100">Users</h1>
            <p className="text-[11px] text-slate-500">
              {loading ? 'Loading…' : `${users.length} registered user${users.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 transition-colors cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Create user
          </button>
        </header>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4 border-b border-slate-800 px-6 py-4 shrink-0">
          {stats.map(({ label, value, icon: Icon, color, bg, ring }) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-100">{loading ? '–' : value}</p>
              </div>
              <div className={clsx('rounded-lg p-1.5', bg, ring && `ring-1 ${ring}`)}>
                <Icon className={clsx('h-4 w-4', color)} />
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-800 px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="w-56 rounded-lg border border-slate-800 bg-slate-900 py-1.5 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/40 transition-all"
            />
          </div>
          <div className="flex items-center gap-1">
            {tabs.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
                  statusFilter === value
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                )}
              >
                {label}
                {value === 'pending' && pendingCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-400">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-sm text-slate-500">No users match your filters.</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-slate-950">
                <tr className="border-b border-slate-800">
                  {['User', 'Status', 'Role', 'Registered', 'Actions'].map((col) => (
                    <th
                      key={col}
                      className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((user) => {
                  const cfg = STATUS_CONFIG[user.status]
                  const StatusIcon = cfg.icon

                  return (
                    <tr key={user.id} className="group hover:bg-slate-900/50 transition-colors">
                      {/* User */}
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-slate-200">{user.name}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={clsx('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', cfg.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          <span className={clsx(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium capitalize w-fit',
                            user.role === 'admin'
                              ? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/25'
                              : 'bg-slate-800 text-slate-400'
                          )}>
                            {user.role === 'admin' && <ShieldCheck className="h-3 w-3" />}
                            {user.role}
                          </span>
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleRoleToggle(user)}
                              disabled={!!actionLoading}
                              className={clsx(
                                'flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium w-fit transition-all cursor-pointer disabled:opacity-40',
                                user.role === 'admin'
                                  ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
                                  : 'text-slate-500 hover:text-violet-400 hover:bg-violet-500/10'
                              )}
                            >
                              {actionLoading === user.id + '-role' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : user.role === 'admin' ? (
                                <><ShieldOff className="h-3 w-3" /> Demote</>
                              ) : (
                                <><ShieldCheck className="h-3 w-3" /> Make admin</>
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4">
                        <p className="text-xs text-slate-400">
                          {new Date(user.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          {user.status !== 'approved' && (
                            <button
                              onClick={() => handleApproveClick(user)}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-green-400 ring-1 ring-green-500/25 hover:bg-green-500/10 disabled:opacity-40 transition-all cursor-pointer"
                            >
                              {actionLoading === user.id + '-approve' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3 w-3" />
                              )}
                              Approve
                            </button>
                          )}
                          {user.status !== 'rejected' && (isSuperAdmin || user.role !== 'admin') && (
                            <button
                              onClick={() => handleReject(user)}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-red-400 ring-1 ring-red-500/25 hover:bg-red-500/10 disabled:opacity-40 transition-all cursor-pointer"
                            >
                              {actionLoading === user.id + '-reject' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              Reject
                            </button>
                          )}

                          {/* App permissions — only meaningful for user-role accounts */}
                          {user.role === 'user' && user.status === 'approved' && (
                            <button
                              onClick={() => { setPermissionsMode('edit'); setPermissionsUser(user) }}
                              disabled={!!actionLoading}
                              title="Edit app permissions"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-violet-400 disabled:opacity-40 transition-all cursor-pointer"
                            >
                              <LayoutGrid className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Change password — superadmin only for admin-role users */}
                          {(isSuperAdmin || user.role !== 'admin') && (
                            <button
                              onClick={() => setPasswordUser(user)}
                              disabled={!!actionLoading}
                              title="Change password"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 disabled:opacity-40 transition-all cursor-pointer"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Delete — admin users can only be deleted by superadmin */}
                          {(user.role !== 'admin' || isSuperAdmin) && (
                            <button
                              onClick={() => setConfirmDelete(user)}
                              disabled={!!actionLoading}
                              title="Delete user"
                              className="rounded-lg p-1.5 text-slate-600 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 transition-all cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Create user modal */}
      {showCreateModal && (
        <CreateUserModal
          isSuperAdmin={isSuperAdmin}
          onClose={() => setShowCreateModal(false)}
          onCreated={(user) => {
            setUsers((prev) => [user, ...prev])
            setShowCreateModal(false)
          }}
        />
      )}

      {/* Change password modal */}
      {passwordUser && (
        <ChangePasswordModal
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
        />
      )}

      {/* App permissions modal */}
      {permissionsUser && (
        <AppPermissionsModal
          userId={permissionsUser.id}
          userName={permissionsUser.name}
          confirmLabel={permissionsMode === 'approve' ? 'Save permissions' : 'Save permissions'}
          onClose={() => setPermissionsUser(null)}
          onSaved={(appIds) => {
            toast.success(`Permissions saved — ${appIds.length} app${appIds.length !== 1 ? 's' : ''}`)
            setPermissionsUser(null)
          }}
        />
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setConfirmDelete(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-50 w-full max-w-sm animate-slide-up rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100">Delete user?</h3>
            <p className="mt-2 text-sm text-slate-400">
              <span className="font-medium text-slate-200">{confirmDelete.name}</span> ({confirmDelete.email})
              will be permanently deleted. This cannot be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!!actionLoading}
                className="flex-1 rounded-xl bg-red-500/15 py-2.5 text-sm font-semibold text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/25 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {actionLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
