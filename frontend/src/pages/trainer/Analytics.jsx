import { useQuery } from '@tanstack/react-query'
import { analyticsAPI } from '../../services/api'
import { TrendingUp, Users, BookOpen, Mic, Award, BarChart2 } from 'lucide-react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import ScoreBadge from '../../components/ScoreBadge'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler)

const chartOpts = {
  responsive: true,
  plugins: { legend: { position: 'bottom' } },
  scales: {
    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
    x: { grid: { display: false } },
  },
}

export default function TrainerAnalytics() {
  const { data: overview } = useQuery({ queryKey: ['analytics-overview'], queryFn: () => analyticsAPI.getOverview() })
  const { data: trends } = useQuery({ queryKey: ['voice-trends'], queryFn: () => analyticsAPI.getVoiceTrends() })

  const stats = overview?.data?.stats || {}
  const topCourses = overview?.data?.top_courses || []
  const trendData = trends?.data?.trends || []

  const barData = {
    labels: topCourses.map(c => c.title?.substring(0, 18) + (c.title?.length > 18 ? '…' : '')),
    datasets: [
      { label: 'Enrolled', data: topCourses.map(c => c.enrolled_count || 0), backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 8 },
      { label: 'Completed', data: topCourses.map(c => c.completed_count || 0), backgroundColor: 'rgba(52,211,153,0.7)', borderRadius: 8 },
    ],
  }

  const lineData = {
    labels: trendData.map(t => t.date),
    datasets: [{
      label: 'Avg Voice Score',
      data: trendData.map(t => t.avg_score),
      borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.08)',
      fill: true, tension: 0.4,
      pointBackgroundColor: '#f97316', pointRadius: 4,
    }],
  }

  const statTiles = [
    { icon: Users, label: 'Active Trainees', value: stats.active_trainees || 0, color: 'text-brand-500', bg: 'bg-brand-50' },
    { icon: BookOpen, label: 'Published Courses', value: stats.published_courses || 0, color: 'text-sage-600', bg: 'bg-sage-50' },
    { icon: Award, label: 'Avg Pass Rate', value: `${stats.avg_pass_rate || 0}%`, color: 'text-amber-500', bg: 'bg-amber-50' },
    { icon: Mic, label: 'Voice Attempts', value: stats.voice_attempts || 0, color: 'text-coral-500', bg: 'bg-coral-50' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title">Analytics</h1>
        <p className="text-gray-500 mt-1">Performance insights across your courses</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statTiles.map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="stat-card">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon size={20} className={color} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart2 size={18} className="text-brand-500" /> Enrollment by Course
          </h2>
          {topCourses.length ? <Bar data={barData} options={chartOpts} /> : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data yet</div>}
        </div>
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-coral-500" /> Voice Score Trend (30 days)
          </h2>
          {trendData.length ? <Line data={lineData} options={chartOpts} /> : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No voice attempts yet</div>}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">Course Performance</h2>
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
                    {c.requires_voice_test && <span className="ml-2 badge badge-coral text-xs">Voice</span>}
                  </td>
                  <td className="py-3 text-center">{c.enrolled_count || 0}</td>
                  <td className="py-3 text-center">{c.completed_count || 0}</td>
                  <td className="py-3 text-center">{c.avg_score ? <ScoreBadge score={c.avg_score} size="sm" /> : '—'}</td>
                  <td className="py-3 text-center">
                    {c.pass_rate != null ? (
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.pass_rate >= 70 ? 'bg-green-400' : 'bg-amber-400'}`} style={{ width: `${c.pass_rate}%` }} />
                        </div>
                        <span className="text-xs text-gray-600">{Math.round(c.pass_rate)}%</span>
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {!topCourses.length && <tr><td colSpan={5} className="py-8 text-center text-gray-400">No data yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
