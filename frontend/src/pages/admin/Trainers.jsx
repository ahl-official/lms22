import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAPI, authAPI, categoriesAPI } from '../../services/api'
import { Search, UserPlus, ToggleLeft, ToggleRight, Briefcase, Phone, Eye, EyeOff } from 'lucide-react'
import MultiCategoryCell from '../../components/MultiCategoryCell'
import toast from 'react-hot-toast'

function CreateTrainerModal({ onClose, onCreated }) {
    const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'trainer', category_id: '' })
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesAPI.getAll() })
    const categories = catData?.data?.categories || []

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.category_id) return toast.error('Please assign a category')
        setLoading(true)
        try {
            await authAPI.register(form)
            toast.success('Trainer created')
            onCreated()
            onClose()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed')
        } finally { setLoading(false) }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
                <h2 className="text-xl font-display font-bold text-gray-800 mb-6">New Trainer</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1">Name</label>
                        <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1">Email</label>
                        <input type="email" className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1">Password</label>
                        <div className="relative">
                            <input type={showPassword ? 'text' : 'password'} className="input-field pr-10" value={form.password}
                                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
                            <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1">Phone (WhatsApp)</label>
                        <div className="relative">
                            <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="tel" className="input-field pl-9" placeholder="+91 9876543210" value={form.phone}
                                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1">Initial Category <span className="text-red-400">*</span></label>
                        <select className="input-field" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} required>
                            <option value="">Select category…</option>
                            {categories.map(cat => <option key={cat._id} value={cat._id}>{cat.name}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                        <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Creating…' : 'Create Trainer'}</button>
                    </div>
                </form>
            </div>
        </div>
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
        } catch { toast.error('Could not fetch password') }
        finally { setLoading(false) }
    }

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-700">{revealed && password ? password : '••••••••'}</span>
            <button onClick={reveal} className="text-gray-400 hover:text-brand-500 transition-colors">
                {loading ? <div className="w-3 h-3 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
                    : revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
        </div>
    )
}


export default function AdminTrainers() {
    const [search, setSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [showModal, setShowModal] = useState(false)
    const qc = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['trainers', search, categoryFilter],
        queryFn: () => usersAPI.getAll({ role: 'trainer', search, category_id: categoryFilter }),
    })

    const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesAPI.getAll() })

    const toggleMutation = useMutation({
        mutationFn: (id) => usersAPI.toggleActive(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['trainers'] }); toast.success('Updated') },
    })

    const categoryMutation = useMutation({
        mutationFn: ({ userId, category_ids }) => usersAPI.assignCategories(userId, category_ids),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['trainers'] }); toast.success('Categories updated') },
        onError: () => toast.error('Failed to update categories'),
    })

    const users = data?.data?.users || []
    const categories = catData?.data?.categories || []

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                <div>
                    <h1 className="page-title">Trainers</h1>
                    <p className="text-gray-500 mt-1">{users.length} trainers</p>
                </div>
                <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
                    <UserPlus size={16} /> New Trainer
                </button>
            </div>

            <div className="flex gap-3 mb-6 flex-wrap">
                <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input className="input-field pl-10 text-sm" placeholder="Search trainers…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select className="input-field w-auto text-sm" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                    <option value="">All categories</option>
                    {categories.map(cat => <option key={cat._id} value={cat._id}>{cat.name}</option>)}
                </select>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" /></div>
            ) : (
                <div className="card overflow-hidden p-0">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr className="text-left text-gray-500">
                                <th className="px-5 py-3 font-medium">Trainer</th>
                                <th className="px-5 py-3 font-medium">Phone</th>
                                <th className="px-5 py-3 font-medium">Categories</th>
                                <th className="px-5 py-3 font-medium">Password</th>
                                <th className="px-5 py-3 font-medium text-center">Status</th>
                                <th className="px-5 py-3 font-medium text-center">Active</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-coral-400 to-coral-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                                {user.name?.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-800">{user.name}</p>
                                                <p className="text-xs text-gray-500">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        {user.phone
                                            ? <span className="flex items-center gap-1.5 text-xs text-gray-600"><Phone size={11} className="text-green-500" />{user.phone}</span>
                                            : <span className="text-xs text-gray-300">—</span>}
                                    </td>
                                    <td className="px-5 py-3">
                                        <MultiCategoryCell
                                            user={user}
                                            categories={categories}
                                            onUpdate={(userId, category_ids) => categoryMutation.mutate({ userId, category_ids })}
                                        />
                                    </td>
                                    <td className="px-5 py-3"><PasswordCell userId={user._id} /></td>
                                    <td className="px-5 py-3 text-center">
                                        <span className={`badge text-xs ${user.is_active ? 'badge-green' : 'badge-gray'}`}>
                                            {user.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <button onClick={() => toggleMutation.mutate(user._id)} className="text-gray-400 hover:text-brand-500 transition-colors">
                                            {user.is_active ? <ToggleRight size={22} className="text-green-500" /> : <ToggleLeft size={22} />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!users.length && <tr><td colSpan={6} className="py-12 text-center text-gray-400">No trainers found</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && <CreateTrainerModal onClose={() => setShowModal(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['trainers'] })} />}
        </div>
    )
}