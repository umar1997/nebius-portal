import { useState, FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Loader2, Zap, Clock, Eye, EyeOff } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../stores/useAuthStore'
import { authApi } from '../lib/api'
import { toast } from '../stores/useToastStore'

export default function SignupPage() {
  const { accessToken } = useAuthStore()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (accessToken) return <Navigate to="/" replace />

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await authApi.signup(form)
      setSuccess(true)
      toast.success('Account submitted for approval')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-slate-900 p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/8 via-transparent to-transparent pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-green-500/5 blur-3xl pointer-events-none" />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/20 ring-1 ring-green-500/30">
            <Zap className="h-5 w-5 text-green-400" />
          </div>
          <span className="text-sm font-bold text-slate-100">Nebius Portal</span>
        </div>

        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-green-400/80 mb-4">
            Request Access
          </p>
          <h1 className="text-4xl font-extrabold leading-tight text-slate-50">
            Join the team.<br />Access the cluster.
          </h1>
          <p className="mt-4 text-base text-slate-400 leading-relaxed max-w-sm">
            Submit your access request. An admin will review and approve your account
            before you can sign in.
          </p>

          <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/8 p-4">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-300">Approval required</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  New accounts require admin approval. You'll be able to sign in once approved.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-slate-600">M42 Internal Tool · {new Date().getFullYear()}</p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-950 px-6 py-12">
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/20 ring-1 ring-green-500/30">
            <Zap className="h-4 w-4 text-green-400" />
          </div>
          <span className="text-sm font-bold text-slate-100">Nebius Portal</span>
        </div>

        <div className="w-full max-w-sm">
          {success ? (
            <div className="text-center animate-fade-in">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/15 ring-1 ring-green-500/30">
                <Clock className="h-6 w-6 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-50">Request submitted</h2>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                Your account is pending admin approval. You'll be able to sign in
                once an admin approves your request.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-block text-sm text-green-400 hover:text-green-300 font-medium transition-colors"
              >
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-50">Create account</h2>
                <p className="mt-1.5 text-sm text-slate-400">
                  Request access to the Nebius Portal
                </p>
              </div>

              {error && (
                <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Full name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    autoComplete="name"
                    value={form.name}
                    onChange={set('name')}
                    placeholder="Your name"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="you@m42.ae"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={form.password}
                      onChange={set('password')}
                      placeholder="Min. 8 characters"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 pr-10 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all"
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
                  <label htmlFor="confirmPassword" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={set('confirmPassword')}
                    placeholder="••••••••"
                    className={clsx(
                      'w-full rounded-xl border bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600',
                      'focus:outline-none focus:ring-2 transition-all',
                      form.confirmPassword && form.password !== form.confirmPassword
                        ? 'border-red-500/50 focus:ring-red-500/30'
                        : 'border-slate-700 focus:ring-green-500/40 focus:border-green-500/50'
                    )}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Request access
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                Already have an account?{' '}
                <Link to="/login" className="text-green-400 hover:text-green-300 font-medium transition-colors">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
