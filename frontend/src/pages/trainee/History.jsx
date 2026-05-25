import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ClipboardList, MessageSquare, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { attemptsAPI, rolePlayAPI, whatsappAPI } from '../../services/api'
import ScoreBadge from '../../components/ScoreBadge'

const relativeTime = (date) => {
  if (!date) return 'Never'
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }) }
  catch { return 'Never' }
}

const roleplayPairs = (attempt) => {
  const pairs = []
  let currentQuestion = attempt.scenario?.opening_line || ''
  for (const turn of attempt.conversation || []) {
    if (turn.role === 'character') currentQuestion = turn.content || currentQuestion
    if (turn.role === 'user') {
      pairs.push({
        question: currentQuestion || 'Customer question',
        answer: turn.content || '',
        feedback: turn.coaching?.tip || turn.coaching?.spoken_feedback || turn.coaching?.what_worked || null,
        score: turn.coaching?.score ?? null,
      })
      currentQuestion = ''
    }
  }
  return pairs
}

const assessmentPairs = (attempt) => {
  if (attempt.voice_transcript) {
    const pairs = []
    const regex = /Q:\s*([\s\S]*?)\nA:\s*([\s\S]*?)(?=\n\nQ:|$)/g
    let match
    while ((match = regex.exec(attempt.voice_transcript)) !== null) {
      pairs.push({ question: match[1]?.trim(), answer: match[2]?.trim() })
    }
    if (pairs.length) return pairs
  }

  const questions = Array.isArray(attempt.questions_snapshot) ? attempt.questions_snapshot : []
  const answers = attempt.answers || {}
  return questions.map((question, index) => ({
    question: question.question || `Question ${index + 1}`,
    answer: question.user_answer ?? answers[index] ?? answers[String(index)] ?? answers[question._id] ?? '',
    correct_answer: question.correct_answer || null,
  }))
}

function AttemptCard({ attempt, type, onSendReport, sendingReport }) {
  const qas = attempt.qa || []
  const isAssessment = type === 'assessment attempt'
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">{attempt.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {attempt.course_title}{attempt.date ? ` - ${relativeTime(attempt.date)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAssessment && (
            <button
              type="button"
              onClick={() => onSendReport(attempt.id)}
              disabled={sendingReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:border-brand-200 hover:text-brand-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              title="Send assessment report to WhatsApp"
            >
              <Send size={13} /> {sendingReport ? 'Sending...' : 'Send Report'}
            </button>
          )}
          {attempt.score != null && <ScoreBadge score={attempt.score} size="sm" />}
        </div>
      </div>

      {attempt.feedback && (
        <p className="text-xs text-gray-600 bg-white border border-gray-100 rounded-lg p-2 mb-3">{attempt.feedback}</p>
      )}

      {qas.length === 0 ? (
        <p className="text-sm text-gray-400">No questions and answers saved for this {type}.</p>
      ) : (
        <div className="space-y-3">
          {qas.map((qa, idx) => (
            <div key={idx} className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Question {idx + 1}</p>
              <p className="text-sm text-gray-800">{qa.question || 'Question not saved'}</p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-3 mb-1">Answer</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{qa.answer || 'No answer saved'}</p>
              {qa.feedback && (
                <>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-3 mb-1">AI feedback</p>
                  <p className="text-sm text-amber-700">{qa.feedback}</p>
                </>
              )}
              {qa.correct_answer && (
                <>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-3 mb-1">Expected answer</p>
                  <p className="text-sm text-green-700">{qa.correct_answer}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TraineeHistory() {
  const [mode, setMode] = useState('roleplaying')
  const [sendingAttemptId, setSendingAttemptId] = useState(null)

  const { data: roleData, isLoading: roleLoading } = useQuery({
    queryKey: ['trainee-roleplay-history'],
    queryFn: () => rolePlayAPI.getMyHistory(),
  })
  const { data: attemptData, isLoading: attemptLoading } = useQuery({
    queryKey: ['trainee-assessment-history'],
    queryFn: () => attemptsAPI.getMy(),
  })

  const roleplays = useMemo(() => (roleData?.data?.attempts || []).map(item => ({
    id: item._id,
    title: item.lesson_title || 'Roleplay',
    course_title: item.course_title || 'Course',
    score: item.score,
    passed: item.passed,
    feedback: item.summary?.summary,
    date: item.submitted_at,
    qa: roleplayPairs(item),
  })), [roleData])

  const assessments = useMemo(() => (attemptData?.data?.attempts || []).map(item => ({
    id: item._id,
    title: item.test_id?.title || 'Assessment',
    course_title: item.course_id?.title || 'Course',
    score: item.score,
    passing_score: item.passing_score || 60,
    passed: item.score != null ? item.score >= (item.passing_score || 60) : false,
    feedback: item.ai_feedback,
    date: item.submitted_at,
    qa: assessmentPairs(item),
  })), [attemptData])

  const sendReportMutation = useMutation({
    mutationFn: (attemptId) => whatsappAPI.sendMyReport(attemptId),
    onMutate: (attemptId) => setSendingAttemptId(attemptId),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Report sent to WhatsApp')
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Could not send report')
    },
    onSettled: () => setSendingAttemptId(null),
  })

  const loading = roleLoading || attemptLoading
  const items = mode === 'roleplaying' ? roleplays : assessments

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title">My History</h1>
        <p className="text-gray-500 mt-1">Review your saved roleplaying and assessment questions and answers.</p>
      </div>

      <div className="card">
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setMode('roleplaying')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${mode === 'roleplaying'
              ? 'bg-brand-500 text-white border-brand-500'
              : 'bg-white text-gray-600 border-gray-200 hover:text-brand-600 hover:border-brand-200'
              }`}
          >
            <MessageSquare size={14} /> Roleplaying ({roleplays.length})
          </button>
          <button
            onClick={() => setMode('assessment')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${mode === 'assessment'
              ? 'bg-brand-500 text-white border-brand-500'
              : 'bg-white text-gray-600 border-gray-200 hover:text-brand-600 hover:border-brand-200'
              }`}
          >
            <ClipboardList size={14} /> Assessment ({assessments.length})
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <p className="text-sm">No {mode === 'roleplaying' ? 'roleplaying' : 'assessment'} history yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <AttemptCard
                key={item.id}
                attempt={item}
                type={mode === 'roleplaying' ? 'roleplay attempt' : 'assessment attempt'}
                onSendReport={(attemptId) => sendReportMutation.mutate(attemptId)}
                sendingReport={sendingAttemptId === item.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
