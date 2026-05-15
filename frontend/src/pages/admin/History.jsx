import { useQuery } from '@tanstack/react-query'
import { analyticsAPI } from '../../services/api'
import LearningHistory from '../../components/LearningHistory'

export default function AdminHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-learning-history'],
    queryFn: () => analyticsAPI.getHistory({ limit: 100 }),
  })

  const history = data?.data?.history || []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title">History</h1>
        <p className="text-gray-500 mt-1">Recent trainee roleplay, assessment, and module activity</p>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <LearningHistory items={history} showTrainee emptyText="No trainee history yet" />
        )}
      </div>
    </div>
  )
}
