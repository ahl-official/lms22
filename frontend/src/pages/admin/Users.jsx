import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAPI, authAPI, categoriesAPI } from '../../services/api'
import { Search, UserPlus, ToggleLeft, ToggleRight, Shield, GraduationCap, Briefcase, Tag, Phone, Eye, EyeOff, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { RoleCell } from '../../components/RoleCell'   // ← NEW

const ROLE_ICON = { admin: Shield, trainer: Briefcase, trainee: GraduationCap }

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'trainee', category_id: '' })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesAPI.getAll(),
  })
  const categories = catData?.data?.categories || []
  const needsCategory = form.role === 'trainer' || form.role === 'trainee'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (needsCategory && !form.category_id) {
      toast.error('Please assign a category')
      return
    }
    setLoading(true)
    try {
      await authAPI.register({
        ...form,
        category_id: needsCategory ? form.category_id : undefined,
      })
      toast.success('User created')
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create user')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h2 className="text-xl font-display font-bold text-gray-800 mb-6">Create User</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Name</label>
            <input
              className="input-field"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Email</label>
            <input
              type="email"
              className="input-field"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field pr-10"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">
              Phone <span className="text-gray-400 font-normal">(for WhatsApp)</span>
            </label>
            <div className="relative">
              <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                className="input-field pl-9"
                placeholder="+91 9876543210"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Role</label>
            <select
              className="input-field"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value, category_id: '' }))}
            >
              <option value="trainee">Trainee</option>
              <option value="trainer">Trainer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {needsCategory && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">
                Category <span className="text-red-400">*</span>
              </label>
              {categories.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                  No categories exist yet. Create categories first.
                </p>
              ) : (
                <select
                  className="input-field"
                  value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  required
                >
                  <option value="">Select a category…</option>
                  {categories.map(cat => (
                    <option key={cat._id} value={cat._id}>{cat.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CategoryCell({ user, categories, onAssign }) {
  const [editing, setEditing] = useState(false)
  const currentName = user.category_id?.name || '—'

  if (user.role === 'admin') return <span className="text-xs text-gray-400">N/A</span>

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-brand-500 transition-colors group"
      >
        <Tag size={11} className="text-gray-400 group-hover:text-brand-400" />
        {currentName}
        <span className="text-gray-300 group-hover:text-brand-300">(edit)</span>
      </button>
    )
  }

  return (
    <select
      autoFocus
      className="input-field text-xs py-1 px-2 w-36"
      defaultValue={user.category_id?._id || ''}
      onBlur={() => setEditing(false)}
      onChange={e => { onAssign(user._id, e.target.value); setEditing(false) }}
    >
      <option value="">Unassigned</option>
      {categories.map(cat => (
        <option key={cat._id} value={cat._id}>{cat.name}</option>
      ))}
    </select>
  )
}

function PasswordCell({ userId }) {
  const [revealed, setRevealed] = useState(false)
  const [password, setPassword] = useState(null)
  const [loading, setLoading] = useState(false)

  const reveal = async () => {
    if (password) { setRevealed(v => !v); return }
    setLoading(true)
    try {
      const res = await usersAPI.getPassword(userId)
      setPassword(res.data.password)
      setRevealed(true)
    } catch {
      toast.error('Could not fetch password')
    } finally { setLoading(false) }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-gray-700">
        {revealed && password ? password : '••••••••'}
      </span>
      <button
        onClick={reveal}
        className="text-gray-400 hover:text-brand-500 transition-colors"
        title={revealed ? 'Hide' : 'Show password'}
      >
        {loading
          ? <div className="w-3 h-3 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
          : revealed ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  )
}

export default function AdminUsers() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['users', search, roleFilter, categoryFilter],
    queryFn: () => usersAPI.getAll({ search, role: roleFilter, category_id: categoryFilter }),
  })

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesAPI.getAll(),
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => usersAPI.toggleActive(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Updated') },
  })

  const categoryMutation = useMutation({
    mutationFn: ({ userId, categoryId }) => usersAPI.assignCategory(userId, categoryId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Category updated') },
    onError: () => toast.error('Failed to update category'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => usersAPI.deleteUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User deleted') },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete user'),
  })

  const handleDelete = (user) => {
    if (!window.confirm(`Delete ${user.name}? This cannot be undone.`)) return
    deleteMutation.mutate(user._id)
  }

  const users = data?.data?.users || []
  const categories = catData?.data?.categories || []

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="text-gray-500 mt-1">{users.length} users</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <UserPlus size={16} /> New User
        </button>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            className="input-field pl-10 text-sm"
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field w-auto text-sm" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="trainer">Trainer</option>
          <option value="trainee">Trainee</option>
        </select>
        <select className="input-field w-auto text-sm" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(cat => (
            <option key={cat._id} value={cat._id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Password</th>
                <th className="px-5 py-3 font-medium text-center">Status</th>
                <th className="px-5 py-3 font-medium text-center">Active</th>
                <th className="px-5 py-3 font-medium text-center">Delete</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {user.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {user.phone ? (
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Phone size={11} className="text-green-500" />
                        {user.phone}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>

                  {/* ── CHANGED: was a static badge, now RoleCell with add/remove ── */}
                  <td className="px-5 py-3">
                    <RoleCell user={user} />
                  </td>
                  {/* ─────────────────────────────────────────────────────────────── */}

                  <td className="px-5 py-3">
                    <CategoryCell
                      user={user}
                      categories={categories}
                      onAssign={(userId, categoryId) => categoryMutation.mutate({ userId, categoryId })}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <PasswordCell userId={user._id} />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`badge text-xs ${user.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => toggleMutation.mutate(user._id)}
                      className="text-gray-400 hover:text-brand-500 transition-colors"
                    >
                      {user.is_active
                        ? <ToggleRight size={22} className="text-green-500" />
                        : <ToggleLeft size={22} />}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => handleDelete(user)}
                      disabled={deleteMutation.isPending}
                      className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                      title="Delete user"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr><td colSpan={8} className="py-12 text-center text-gray-400">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CreateUserModal
          onClose={() => setShowModal(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['users'] })}
        />
      )}
    </div>
  )
}