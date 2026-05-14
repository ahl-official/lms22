import { useQuery, useMutation } from '@tanstack/react-query'
import { analyticsAPI, categoriesAPI } from '../../services/api'
import ScoreBadge from '../../components/ScoreBadge'
import { Users, BookOpen, GraduationCap, Mic, TrendingUp, Award, Tag, Briefcase, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AdminOverview() {
  const { data } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => analyticsAPI.getOverview(),
  })

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesAPI.getAll(),
  })

  const migrateMutation = useMutation({
    mutationFn: () => categoriesAPI.migrateCourses(),
    onSuccess: (res) => toast.success(res.data.message),
    onError: () => toast.error('Migration failed'),
  })

  const stats = data?.data?.stats || {}
  const topCourses = data?.data?.top_courses || []
  const categories = catData?.data?.categories || []

  const tiles = [
    { label: 'Total Users', value: stats.total_users || 0, icon: Users, color: 'text-brand-500', bg: 'bg-brand-50' },
    { label: 'Trainees', value: stats.trainees || 0, icon: GraduationCap, color: 'text-sage-600', bg: 'bg-sage-50' },
    { label: 'Published Courses', value: stats.published_courses || 0, icon: BookOpen, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Voice Attempts', value: stats.voice_attempts || 0, icon: Mic, color: 'text-coral-500', bg: 'bg-coral-50' },
    { label: 'Enrollments', value: stats.total_enrollments || 0, icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Avg Pass Rate', value: `${stats.avg_pass_rate || 0}%`, icon: Award, color: 'text-purple-500', bg: 'bg-purple-50' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title">Platform Overview</h1>
          <p className="text-gray-500 mt-1">All activity across the platform</p>
        </div>
        {/* Run once to stamp category_id on all existing courses */}
        <button
          onClick={() => migrateMutation.mutate()}
          disabled={migrateMutation.isPending}
          className="btn-secondary flex items-center gap-2 text-sm"
          title="Fix existing courses that have no category assigned"
        >
          <Wrench size={14} />
          {migrateMutation.isPending ? 'Migrating…' : 'Fix Course Categories'}
        </button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {tiles.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon size={20} className={color} />
            </div>
            <p className="text-2xl font-display font-bold text-gray-800">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Categories breakdown */}
      {categories.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Tag size={16} className="text-brand-500" />
            <h2 className="font-semibold text-gray-800">Categories</h2>
            <span className="ml-auto text-xs text-gray-400">{categories.length} total</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map(cat => (
              <div
                key={cat._id}
                className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
                    <Tag size={13} className="text-brand-600" />
                  </div>
                  <p className="font-semibold text-gray-800 text-sm truncate">{cat.name}</p>
                </div>
                {cat.description && (
                  <p className="text-xs text-gray-400 truncate">{cat.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Briefcase size={10} className="text-brand-400" />
                    {cat.trainer_count ?? '—'} trainers
                  </span>
                  <span className="flex items-center gap-1">
                    <GraduationCap size={10} className="text-sage-500" />
                    {cat.trainee_count ?? '—'} trainees
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top courses table */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">Top Courses by Enrollment</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-3 font-medium">Course</th>
                <th className="pb-3 font-medium text-center">Enrolled</th>
                <th className="pb-3 font-medium text-center">Completed</th>
                <th className="pb-3 font-medium text-center">Avg Score</th>
                <th className="pb-3 font-medium text-center">Pass Rate</th>
              </tr>
            </thead>
            <tbody>
              {topCourses.map(c => (
                <tr key={c._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-3 font-medium text-gray-700">
                    {c.title}
                    {c.requires_voice_test && (
                      <span className="ml-2 badge badge-coral text-xs">Voice</span>
                    )}
                  </td>
                  <td className="py-3 text-center">{c.enrolled_count}</td>
                  <td className="py-3 text-center">{c.completed_count}</td>
                  <td className="py-3 text-center">
                    {c.avg_score ? <ScoreBadge score={c.avg_score} size="sm" /> : '—'}
                  </td>
                  <td className="py-3 text-center">
                    {c.pass_rate != null ? `${Math.round(c.pass_rate)}%` : '—'}
                  </td>
                </tr>
              ))}
              {!topCourses.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">No data yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}