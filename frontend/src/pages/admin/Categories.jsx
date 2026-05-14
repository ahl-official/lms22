import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { categoriesAPI } from '../../services/api'
import {
    Tag, Plus, Pencil, Trash2, X, Users, Briefcase,
    GraduationCap, CheckCircle, AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Create / Edit Modal ──────────────────────────────────
function CategoryModal({ existing, onClose, onSaved }) {
    const [form, setForm] = useState({
        name: existing?.name || '',
        description: existing?.description || '',
    })
    const [loading, setLoading] = useState(false)
    const isEdit = !!existing

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.name.trim()) return toast.error('Name is required')
        setLoading(true)
        try {
            if (isEdit) {
                await categoriesAPI.update(existing._id, form)
                toast.success('Category updated')
            } else {
                await categoriesAPI.create(form)
                toast.success('Category created')
            }
            onSaved()
            onClose()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed')
        } finally { setLoading(false) }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-display font-bold text-gray-800">
                        {isEdit ? 'Edit Category' : 'New Category'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1">
                            Name <span className="text-red-400">*</span>
                        </label>
                        <input
                            className="input-field"
                            placeholder="e.g. Sales, Operations, HR"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1">
                            Description <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                            className="input-field resize-none min-h-[80px]"
                            placeholder="What is this category for?"
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                        <button type="submit" disabled={loading} className="btn-primary flex-1">
                            {loading ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Category')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ── Members Drawer ───────────────────────────────────────
function MembersDrawer({ category, onClose }) {
    const { data, isLoading } = useQuery({
        queryKey: ['category-members', category._id],
        queryFn: () => categoriesAPI.getMembers(category._id),
    })

    const trainers = data?.data?.trainers || []
    const trainees = data?.data?.trainees || []

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center">
                            <Tag size={15} className="text-brand-600" />
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-800">{category.name}</h2>
                            <p className="text-xs text-gray-400">Members</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-6 space-y-5">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* Trainers */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <Briefcase size={14} className="text-brand-500" />
                                    <h3 className="text-sm font-semibold text-gray-700">
                                        Trainers <span className="text-gray-400 font-normal">({trainers.length})</span>
                                    </h3>
                                </div>
                                {trainers.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic pl-5">No trainers assigned</p>
                                ) : (
                                    <div className="space-y-2">
                                        {trainers.map(t => (
                                            <div key={t._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                                    {t.name?.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{t.name}</p>
                                                    <p className="text-xs text-gray-500 truncate">{t.email}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Trainees */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <GraduationCap size={14} className="text-sage-600" />
                                    <h3 className="text-sm font-semibold text-gray-700">
                                        Trainees <span className="text-gray-400 font-normal">({trainees.length})</span>
                                    </h3>
                                </div>
                                {trainees.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic pl-5">No trainees assigned</p>
                                ) : (
                                    <div className="space-y-2">
                                        {trainees.map(t => (
                                            <div key={t._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sage-400 to-sage-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                                    {t.name?.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{t.name}</p>
                                                    <p className="text-xs text-gray-500 truncate">{t.email}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Delete Confirm Modal ─────────────────────────────────
function DeleteConfirmModal({ category, onClose, onDeleted }) {
    const [loading, setLoading] = useState(false)

    const handleDelete = async () => {
        setLoading(true)
        try {
            await categoriesAPI.delete(category._id)
            toast.success('Category deactivated')
            onDeleted()
            onClose()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed')
        } finally { setLoading(false) }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={26} className="text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-2">Deactivate Category?</h2>
                <p className="text-sm text-gray-500 mb-1">
                    <strong>"{category.name}"</strong> will be deactivated.
                </p>
                <p className="text-sm text-red-400 mb-6">
                    All trainers and trainees in this category will be unlinked.
                </p>
                <div className="flex gap-3">
                    <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                    <button
                        onClick={handleDelete}
                        disabled={loading}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Deactivating…' : 'Yes, Deactivate'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Main Page ────────────────────────────────────────────
export default function AdminCategories() {
    const qc = useQueryClient()
    const [showCreate, setShowCreate] = useState(false)
    const [editCategory, setEditCategory] = useState(null)
    const [viewCategory, setViewCategory] = useState(null)
    const [deleteCategory, setDeleteCategory] = useState(null)

    const { data, isLoading } = useQuery({
        queryKey: ['categories'],
        queryFn: () => categoriesAPI.getAll(),
    })

    const categories = data?.data?.categories || []
    const invalidate = () => qc.invalidateQueries({ queryKey: ['categories'] })

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                <div>
                    <h1 className="page-title">Categories</h1>
                    <p className="text-gray-500 mt-1">
                        Group trainers and trainees into focused categories
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="btn-primary flex items-center gap-2"
                >
                    <Plus size={16} /> New Category
                </button>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                </div>
            ) : categories.length === 0 ? (
                <div className="text-center py-20">
                    <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
                        <Tag size={28} className="text-brand-400" />
                    </div>
                    <p className="text-gray-500 font-medium mb-1">No categories yet</p>
                    <p className="text-sm text-gray-400 mb-6">
                        Create your first category to start assigning trainers and trainees
                    </p>
                    <button onClick={() => setShowCreate(true)} className="btn-primary">
                        Create First Category
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categories.map(cat => (
                        <div
                            key={cat._id}
                            className="card hover:shadow-md transition-shadow flex flex-col gap-4"
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                                        <Tag size={18} className="text-brand-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-gray-800 truncate">{cat.name}</h3>
                                        {cat.description ? (
                                            <p className="text-xs text-gray-500 truncate">{cat.description}</p>
                                        ) : (
                                            <p className="text-xs text-gray-300 italic">No description</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                        onClick={() => setEditCategory(cat)}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                                        title="Edit"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        onClick={() => setDeleteCategory(cat)}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                        title="Deactivate"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Member counts */}
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 px-3 py-2 bg-brand-50 rounded-xl flex-1 justify-center">
                                    <Briefcase size={13} className="text-brand-500" />
                                    <span className="text-sm font-bold text-brand-700">{cat.trainer_count ?? 0}</span>
                                    <span className="text-xs text-brand-500">Trainers</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-3 py-2 bg-sage-50 rounded-xl flex-1 justify-center">
                                    <GraduationCap size={13} className="text-sage-600" />
                                    <span className="text-sm font-bold text-sage-700">{cat.trainee_count ?? 0}</span>
                                    <span className="text-xs text-sage-600">Trainees</span>
                                </div>
                            </div>

                            {/* View members button */}
                            <button
                                onClick={() => setViewCategory(cat)}
                                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-brand-300 hover:text-brand-500 transition-colors"
                            >
                                <Users size={14} /> View Members
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Modals */}
            {showCreate && (
                <CategoryModal
                    onClose={() => setShowCreate(false)}
                    onSaved={invalidate}
                />
            )}
            {editCategory && (
                <CategoryModal
                    existing={editCategory}
                    onClose={() => setEditCategory(null)}
                    onSaved={invalidate}
                />
            )}
            {viewCategory && (
                <MembersDrawer
                    category={viewCategory}
                    onClose={() => setViewCategory(null)}
                />
            )}
            {deleteCategory && (
                <DeleteConfirmModal
                    category={deleteCategory}
                    onClose={() => setDeleteCategory(null)}
                    onDeleted={invalidate}
                />
            )}
        </div>
    )
}