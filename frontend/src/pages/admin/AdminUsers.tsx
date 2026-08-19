import { useState, useEffect, useMemo } from 'react'
import { CheckCircle, XCircle, Trash2, Clock, Loader2, Search } from 'lucide-react'
import AdminSidebar from '../../components/AdminSidebar'
import { User, adminApi } from '../../lib/api'
import { toast } from '../../stores/useToastStore'
import { clsx } from 'clsx'

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

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null)

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

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter
      const q = search.toLowerCase()
      const matchesSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [users, statusFilter, search])

  const handleApprove = async (user: User) => {
    setActionLoading(user.id + '-approve')
    try {
      await adminApi.approveUser(user.id)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: 'approved' } : u)))
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
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: 'rejected' } : u)))
      toast.success(`${user.name} rejected`)
    } catch {
      toast.error('Failed to reject user')
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
        </header>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-800 px-6 py-3">
          {/* Search */}
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

          {/* Status tabs */}
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
                  {['User', 'Status', 'Registered', 'Actions'].map((col) => (
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
                    <tr
                      key={user.id}
                      className="group hover:bg-slate-900/50 transition-colors"
                    >
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

                      {/* Date */}
                      <td className="px-6 py-4">
                        <p className="text-xs text-slate-400">
                          {new Date(user.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {user.status !== 'approved' && (
                            <button
                              onClick={() => handleApprove(user)}
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
                          {user.status !== 'rejected' && (
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
                          <button
                            onClick={() => setConfirmDelete(user)}
                            disabled={!!actionLoading}
                            className="rounded-lg p-1.5 text-slate-600 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 transition-all cursor-pointer"
                            aria-label="Delete user"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
