import { useState, useEffect, useRef } from 'react'
import { Tag, X, Plus } from 'lucide-react'

/**
 * MultiCategoryCell
 * Shows a user's current categories as removable badges.
 * "+ Add" opens a dropdown of remaining available categories.
 *
 * Props:
 *   user        — user object (has category_ids[] or fallback category_id)
 *   categories  — full list of all available Category objects [{ _id, name }]
 *   onUpdate    — (userId, newCategoryIds[]) => void
 */
export default function MultiCategoryCell({ user, categories, onUpdate }) {
    const [open, setOpen] = useState(false)
    const dropdownRef = useRef(null)
    const btnRef = useRef(null)
    const [dropdownStyle, setDropdownStyle] = useState({})

    // Build current list from category_ids (populated objects or raw IDs) or legacy category_id
    const current = user.category_ids?.length
        ? user.category_ids
        : user.category_id ? [user.category_id] : []

    const currentIds = current.map(c => String(c._id || c))
    const available = categories.filter(c => !currentIds.includes(String(c._id)))

    // Position dropdown relative to button so it escapes table overflow
    const openDropdown = () => {
        if (!btnRef.current) return
        const rect = btnRef.current.getBoundingClientRect()
        setDropdownStyle({
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            zIndex: 9999,
        })
        setOpen(true)
    }

    // Close on click outside
    useEffect(() => {
        if (!open) return
        const handler = (e) => {
            if (!dropdownRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    const remove = (catId) => {
        onUpdate(user._id, currentIds.filter(id => id !== String(catId)))
    }

    const add = (catId) => {
        onUpdate(user._id, [...currentIds, String(catId)])
        setOpen(false)
    }

    const getName = (cat) =>
        cat.name || categories.find(c => String(c._id) === String(cat._id || cat))?.name || '…'

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {current.map(cat => {
                const id = cat._id || cat
                return (
                    <span
                        key={String(id)}
                        className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-2 py-1 rounded-full border border-brand-100"
                    >
                        <Tag size={9} className="flex-shrink-0" />
                        {getName(cat)}
                        <button
                            onClick={() => remove(id)}
                            className="ml-0.5 text-brand-400 hover:text-red-500 transition-colors flex-shrink-0"
                            title="Remove category"
                        >
                            <X size={10} />
                        </button>
                    </span>
                )
            })}

            {available.length > 0 && (
                <>
                    <button
                        ref={btnRef}
                        onClick={openDropdown}
                        className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-brand-600 border border-dashed border-gray-300 hover:border-brand-400 px-2 py-1 rounded-full transition-colors"
                    >
                        <Plus size={10} /> Add
                    </button>

                    {open && (
                        <div
                            ref={dropdownRef}
                            style={dropdownStyle}
                            className="bg-white border border-gray-200 rounded-xl shadow-xl min-w-36 py-1"
                        >
                            <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100">
                                Add category
                            </p>
                            {available.map(cat => (
                                <button
                                    key={cat._id}
                                    onClick={() => add(cat._id)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-brand-50 hover:text-brand-600 transition-colors"
                                >
                                    <Tag size={10} className="text-brand-400 flex-shrink-0" />
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}

            {current.length === 0 && !available.length && (
                <span className="text-xs text-gray-300">No categories</span>
            )}
        </div>
    )
}