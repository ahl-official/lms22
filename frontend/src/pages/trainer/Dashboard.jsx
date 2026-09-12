import { useQuery } from '@tanstack/react-query'
import { analyticsAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { BookOpen, Users, BarChart2, Tag, History } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function TrainerDashboard() {
    const { user } = useAuthStore()

    const { data } = useQuery({
        queryKey: ['analytics-overview'],
        queryFn: () => analyticsAPI.getOverview(),
    })

    const stats = data?.data?.stats || {}

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="mb-8">
                <h1 className="page-title">Welcome, {user?.name}</h1>
                {user?.category_id && (
                    <div className="flex items-center gap-2 mt-2">
                        <Tag size={14} className="text-brand-500" />
                        <span className="text-sm font-semibold text-brand-600">{user.category_id.name} Department</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {[
                    { label: 'My Students', value: stats.trainees || 0, icon: Users, color: 'text-sage-600', bg: 'bg-sage-50', to: '/trainer/trainees' },
                    { label: 'My Courses', value: stats.published_courses || 0, icon: BookOpen, color: 'text-brand-500', bg: 'bg-brand-50', to: '/trainer/courses' },
                    { label: 'Activities', value: stats.total_enrollments || 0, icon: BarChart2, color: 'text-coral-500', bg: 'bg-coral-50', to: '/trainer/analytics' },
                ].map(({ label, value, icon: Icon, color, bg, to }) => (
                    <Link key={label} to={to} className="stat-card hover:shadow-md transition-shadow">
                        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                            <Icon size={20} className={color} />
                        </div>
                        <p className="text-2xl font-display font-bold text-gray-800">{value}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
                    </Link>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link to="/trainer/trainees" className="card hover:shadow-md transition-shadow flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-sage-50 flex items-center justify-center flex-shrink-0">
                        <Users size={22} className="text-sage-600" />
                    </div>
                    <div>
                        <p className="font-semibold text-gray-800">My Students</p>
                        <p className="text-sm text-gray-500">View and manage your students</p>
                    </div>
                </Link>
                <Link to="/trainer/analytics" className="card hover:shadow-md transition-shadow flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-coral-50 flex items-center justify-center flex-shrink-0">
                        <BarChart2 size={22} className="text-coral-500" />
                    </div>
                    <div>
                        <p className="font-semibold text-gray-800">Activities Review</p>
                        <p className="text-sm text-gray-500">Track progress and scores</p>
                    </div>
                </Link>
            </div>

            <Link to="/trainer/history" className="card mt-8 hover:shadow-md transition-shadow flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <History size={22} className="text-brand-500" />
                </div>
                <div>
                    <p className="font-semibold text-gray-800">Student History</p>
                    <p className="text-sm text-gray-500">Open student roleplaying and assessment questions and answers</p>
                </div>
            </Link>
        </div>
    )
}
