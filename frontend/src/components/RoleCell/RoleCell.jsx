// ─────────────────────────────────────────────────────────────────────────────
// NEW COMPONENT — drop this into your AdminUsers.jsx (or its own file)
// Replaces the static <span className="badge ..."> in the Role column
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, GraduationCap, Users, Plus, X, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { rolesAPI } from '../../services/api'
import useAuthStore from '../../store/authStore'

const ROLE_CONFIG = {
    admin: { label: 'Admin', badge: 'bg-purple-100 text-purple-700 border-purple-200', Icon: Shield },
    trainer: { label: 'Trainer', badge: 'bg-blue-100   text-blue-700   border-blue-200', Icon: Users },
    trainee: { label: 'Trainee', badge: 'bg-green-100  text-green-700  border-green-200', Icon: GraduationCap },
}

// Which roles can the current actor assign?
const ASSIGNABLE_ROLES = {
    admin: ['admin', 'trainer', 'trainee'],
    trainer: ['trainee'],
}

export function RoleCell({ user, onUpdated }) {
    const [open, setOpen] = useState(false)
    const qc = useQueryClient()
    const { hasRole } = useAuthStore()

    const actorRole = hasRole('admin') ? 'admin' : hasRole('trainer') ? 'trainer' : null
    const assignable = ASSIGNABLE_ROLES[actorRole] || []
    const userRoles = user.roles?.length ? user.roles : [user.role].filter(Boolean)

    const addMutation = useMutation({
        mutationFn: ({ userId, role }) => rolesAPI.addRole(userId, role),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['users'] })
            toast.success('Role added')
            onUpdated?.()
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to add role'),
    })

    const removeMutation = useMutation({
        mutationFn: ({ userId, role }) => rolesAPI.removeRole(userId, role),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['users'] })
            toast.success('Role removed')
            onUpdated?.()
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to remove role'),
    })

    const isPending = addMutation.isPending || removeMutation.isPending

    // Roles the actor CAN still add to this user
    const addableRoles = assignable.filter((r) => !userRoles.includes(r))

    return (
        <div className="relative">
            {/* Current role badges */}
            <div className="flex flex-wrap gap-1 items-center">
                {userRoles.map((r) => {
                    const cfg = ROLE_CONFIG[r] || ROLE_CONFIG.trainee
                    const canRemove = assignable.includes(r) && userRoles.length > 1

                    return (
                        <span
                            key={r}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.badge}`}
                        >
                            <cfg.Icon size={10} />
                            {cfg.label}
                            {canRemove && (
                                <button
                                    onClick={() => removeMutation.mutate({ userId: user._id, role: r })}
                                    disabled={isPending}
                                    className="ml-0.5 hover:opacity-70 disabled:opacity-40"
                                    title={`Remove ${r} role`}
                                >
                                    <X size={10} />
                                </button>
                            )}
                        </span>
                    )
                })}

                {/* Add role button — only shown if there are addable roles */}
                {addableRoles.length > 0 && (
                    <div className="relative">
                        <button
                            onClick={() => setOpen((v) => !v)}
                            disabled={isPending}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold border border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors disabled:opacity-40"
                            title="Add role"
                        >
                            <Plus size={10} />
                            <ChevronDown size={9} />
                        </button>

                        {open && (
                            <div className="absolute z-20 top-6 left-0 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-28">
                                {addableRoles.map((r) => {
                                    const cfg = ROLE_CONFIG[r]
                                    return (
                                        <button
                                            key={r}
                                            onClick={() => {
                                                addMutation.mutate({ userId: user._id, role: r })
                                                setOpen(false)
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                                        >
                                            <cfg.Icon size={12} className="text-gray-400" />
                                            Add {cfg.label}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}