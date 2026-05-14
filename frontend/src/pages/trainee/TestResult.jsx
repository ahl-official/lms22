// frontend/src/pages/trainee/TestResult.jsx
// FIX: rubric bar width — values from scoreConversation are 0-100 percentages.
// Old formula (val / 25) * 100 assumed out-of-25 scores → bars showed 320% width.

import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { attemptsAPI, recommendationsAPI } from '../../services/api'
import ScoreBadge from '../../components/ScoreBadge'
import {
  CheckCircle, XCircle, Mic, FileText, Home,
  RefreshCw, MessageSquare, Award, TrendingUp,
  AlertCircle, BookOpen,
} from 'lucide-react'
import { format } from 'date-fns'

export default function TestResult() {
  const { attemptId } = useParams()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => attemptsAPI.getOne(attemptId),
    refetchInterval: d => {
      const attempt = d?.data?.attempt
      return attempt?.status === 'processing' ? 3000 : false
    },
  })

  const attempt = data?.data?.attempt

  const recMutation = useMutation({
    mutationFn: (attempt_id) => recommendationsAPI.generate({ attempt_id }),
  })

  useEffect(() => {
    if (attempt && attempt.status === 'scored' && attempt.test_type === 'voice') {
      const passed = attempt.score >= (attempt.passing_score || 60)
      if (!passed && !recMutation.isSuccess && !recMutation.isPending) {
        recMutation.mutate(attempt._id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?._id, attempt?.status])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        <p className="text-gray-500">Loading results…</p>
      </div>
    )
  }

  if (!attempt) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-gray-500">Result not found</p>
        <button onClick={() => navigate('/trainee')} className="btn-secondary">
          Back to courses
        </button>
      </div>
    )
  }

  const isProcessing = attempt.status === 'processing'
  const passed = attempt.score >= (attempt.passing_score || 60)
  const isVoice = attempt.test_type === 'voice'
  const recordingUrl =
    isVoice && attempt.recording_gridfs_id
      ? attemptsAPI.getRecordingUrl(attempt._id)
      : null

  const rubric = attempt.ai_rubric_breakdown || null
  const rubricBreakdown = rubric?.rubric_breakdown || null
  const strengths = rubric?.strengths || []
  const improvementAreas = rubric?.improvement_areas || []
  const flatRubric =
    rubric && !rubricBreakdown && !rubric.strengths && typeof rubric === 'object'
      ? rubric
      : null

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title">Test Result</h1>
        <p className="text-gray-500 mt-1">{attempt.course_title}</p>
      </div>

      {isProcessing ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 border-4 border-coral-200 border-t-coral-500 rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            Processing your voice response…
          </h2>
          <p className="text-gray-500">This usually takes 30–60 seconds. Hang tight!</p>
        </div>
      ) : (
        <>
          {/* Score card */}
          <div className={`card text-center mb-6 border-2 ${passed ? 'border-green-200' : 'border-red-200'}`}>
            <div className="flex justify-center mb-4">
              <ScoreBadge score={attempt.score} size="lg" variant="ring" />
            </div>
            <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold mb-4 ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
              {passed ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {passed ? 'Passed' : 'Did not pass'}
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-500 mb-1">Type</p>
                <span className={`badge text-xs ${isVoice ? 'badge-coral' : 'badge-blue'} flex items-center gap-1 justify-center`}>
                  {isVoice ? <Mic size={10} /> : <FileText size={10} />}
                  {isVoice ? 'Voice' : 'Written'}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Passing Score</p>
                <p className="font-semibold text-gray-700">{attempt.passing_score || 60}%</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Submitted</p>
                <p className="font-semibold text-gray-700 text-xs">
                  {format(new Date(attempt.submitted_at), 'MMM d, h:mm a')}
                </p>
              </div>
            </div>
          </div>

          {/* VOICE: Rich AI feedback */}
          {isVoice && (
            <div className="card mb-6">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                <MessageSquare size={18} className="text-coral-500" /> AI Feedback
              </h2>

              {attempt.ai_feedback ? (
                <div className="bg-gray-50 rounded-xl p-4 mb-5">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{attempt.ai_feedback}</p>
                </div>
              ) : (
                <p className="text-gray-400 text-sm mb-5">No feedback available</p>
              )}

              {strengths.length > 0 && (
                <div className="mb-5">
                  <p className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1.5">
                    <CheckCircle size={14} /> What you did well
                  </p>
                  <ul className="space-y-2">
                    {strengths.map((s, i) => (
                      <li key={i} className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-2.5">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {improvementAreas.length > 0 && (
                <div className="mb-5">
                  <p className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                    <TrendingUp size={14} /> Areas to improve
                  </p>
                  <div className="space-y-3">
                    {improvementAreas.map((area, i) => (
                      <div key={i} className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                        <p className="text-sm font-semibold text-amber-800">{area.topic}</p>
                        <p className="text-xs text-amber-700 mt-1">{area.issue}</p>
                        <div className="mt-2 flex items-start gap-1.5">
                          <span className="text-xs font-bold text-gray-500 flex-shrink-0 mt-0.5">→</span>
                          <p className="text-xs text-gray-700 font-medium">{area.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Rubric breakdown — new format ─────────────────────────────
                  FIX: values are already 0-100 percentages from scoreConversation.
                  Was: (val / 25) * 100  →  bar showed 320% for an 80 score.
                  Now: Math.min(val, 100)  →  correct width.
              ──────────────────────────────────────────────────────────────── */}
              {rubricBreakdown && (
                <div className="mb-5">
                  <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <Award size={14} /> Score breakdown
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(rubricBreakdown).map(([key, val]) => (
                      <div key={key} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-500 capitalize mb-1">
                          {key.replace(/_/g, ' ')}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-500 rounded-full transition-all"
                              style={{ width: `${Math.min(val, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-gray-700">{val}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Old flat rubric fallback — already correct (uses val%) */}
              {flatRubric && !rubricBreakdown && (
                <div className="mb-5">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Score breakdown</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(flatRubric)
                      .filter(([, v]) => typeof v === 'number')
                      .map(([key, val]) => (
                        <div key={key} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-500 capitalize mb-1">
                            {key.replace(/_/g, ' ')}
                          </p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand-500 rounded-full transition-all"
                                style={{ width: `${Math.min(val, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-700">{val}%</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {recordingUrl && (
                <div className="mb-5">
                  <p className="text-sm font-medium text-gray-600 mb-2">Your recording:</p>
                  <audio controls src={recordingUrl} className="w-full rounded-xl" />
                </div>
              )}

              {!passed && (
                <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <BookOpen size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Study recommendations on the way</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Personalised suggestions have been sent to your trainer for review.
                      Once approved, they'll appear in your recommendations panel.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WRITTEN: Answer breakdown */}
          {!isVoice && attempt.questions_snapshot?.length > 0 && (
            <div className="card mb-6">
              <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Award size={18} className="text-brand-500" /> Answer Review
              </h2>

              {attempt.questions_snapshot.some(q => (q.points || 1) > 1) && (
                <div className="flex items-start gap-2 p-3 bg-brand-50 rounded-xl mb-4">
                  <AlertCircle size={14} className="text-brand-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-brand-700">
                    Questions are weighted by difficulty — harder questions are worth more points.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {attempt.questions_snapshot.map((q, i) => (
                  <div key={i} className={`p-4 rounded-xl border-2 ${q.is_correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                    }`}>
                    <div className="flex items-start gap-2 mb-2">
                      {q.is_correct
                        ? <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                        : <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                      }
                      <div className="flex-1">
                        <p className="font-medium text-gray-800 text-sm">{q.question}</p>
                        {(q.points || 1) > 1 && (
                          <span className="text-xs text-gray-500">Worth {q.points} points</span>
                        )}
                      </div>
                    </div>
                    <div className="pl-6 space-y-1 text-sm">
                      <p className={q.is_correct ? 'text-green-700' : 'text-red-700'}>
                        Your answer: <strong>{q.user_answer || 'No answer'}</strong>
                      </p>
                      {!q.is_correct && (
                        <p className="text-green-700">
                          Correct: <strong>{q.correct_answer}</strong>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <button onClick={() => navigate('/trainee')} className="btn-primary flex items-center gap-2">
              <Home size={16} /> My Courses
            </button>
            <button
              onClick={() => navigate(`/trainee/courses/${attempt.course_id?._id || attempt.course_id}`)}
              className="btn-secondary flex items-center gap-2"
            >
              <RefreshCw size={16} /> Retake
            </button>
          </div>
        </>
      )}
    </div>
  )
}