import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { attemptsAPI, lessonProgressAPI, rolePlayAPI } from '../../services/api'
import LearningHistory from '../../components/LearningHistory'

export default function TraineeHistory() {
  const { data: roleData, isLoading: roleLoading } = useQuery({
    queryKey: ['trainee-roleplay-history'],
    queryFn: () => rolePlayAPI.getMyHistory(),
  })
  const { data: attemptData, isLoading: attemptLoading } = useQuery({
    queryKey: ['trainee-assessment-history'],
    queryFn: () => attemptsAPI.getMy(),
  })
  const { data: progressData, isLoading: progressLoading } = useQuery({
    queryKey: ['trainee-lesson-history'],
    queryFn: () => lessonProgressAPI.getMy(),
  })

  const history = useMemo(() => {
    const roleplays = (roleData?.data?.attempts || []).map(item => ({
      id: item._id,
      type: 'roleplay',
      title: item.lesson_title || 'Roleplay',
      course_title: item.course_title || 'Course',
      module_title: item.module_title || null,
      score: item.score,
      grade: item.grade,
      passed: item.passed,
      question_count: item.question_count,
      feedback: item.summary?.summary,
      responses: (item.conversation || []).filter(t => t.role === 'user').map(t => t.content),
      date: item.submitted_at,
    }))

    const assessments = (attemptData?.data?.attempts || []).map(item => ({
      id: item._id,
      type: 'assessment',
      title: item.test_id?.title || 'Assessment',
      course_title: item.course_id?.title || 'Course',
      test_type: item.test_type,
      score: item.score,
      passing_score: item.passing_score || 60,
      passed: item.score != null ? item.score >= (item.passing_score || 60) : false,
      feedback: item.ai_feedback,
      date: item.submitted_at,
    }))

    const lessons = (progressData?.data?.progress || []).map(item => ({
      id: item._id,
      type: 'lesson',
      title: item.lesson_id?.title || 'Lesson',
      course_title: item.course_id?.title || 'Course',
      module_title: item.module_id?.title || null,
      status: item.status,
      score: item.score,
      watch_percent: item.watch_percent || 0,
      date: item.completed_at || item.updatedAt,
    }))

    return [...roleplays, ...assessments, ...lessons]
      .filter(item => item.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [roleData, attemptData, progressData])

  const loading = roleLoading || attemptLoading || progressLoading

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title">History</h1>
        <p className="text-gray-500 mt-1">Your video, roleplay, and assessment activity</p>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <LearningHistory items={history} emptyText="No learning history yet" />
        )}
      </div>
    </div>
  )
}
