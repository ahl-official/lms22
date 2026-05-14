import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../../services/api'
import useAuth from '../../hooks/useAuth'
import { Mic, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

const ROLE_HOME = { admin: '/admin', trainer: '/trainer', trainee: '/trainee' }

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authAPI.login(form)
      const user = res.data.user
      login(user, res.data.token)

      // Check both roles array and legacy role string — use whichever has a real value
      const rolesFromArray = user?.roles || []
      const roleFromString = user?.role
      const allRoles = [...new Set([...rolesFromArray, ...(roleFromString ? [roleFromString] : [])])]

      // Pick the most privileged role: admin > trainer > trainee
      const priority = ['admin', 'trainer', 'trainee']
      const role = priority.find((r) => allRoles.includes(r)) || 'trainee'

      navigate(ROLE_HOME[role])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 via-brand-500 to-indigo-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-white/20 backdrop-blur items-center justify-center mb-4">
            <Mic size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold text-white">LMS Platform</h1>
          <p className="text-white/70 mt-2">Sign in to continue learning</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Email</label>
              <input type="email" className="input-field"
                placeholder="you@company.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input-field pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPw(s => !s)}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base mt-2">
              {loading
                ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : 'Sign In'
              }
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
