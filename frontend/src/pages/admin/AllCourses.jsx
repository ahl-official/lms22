import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { coursesAPI } from '../../services/api'
import { BookOpen, Mic, Globe, EyeOff, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AdminCourses() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['all-courses'],
    queryFn: () => coursesAPI.getAll(),
  })

  const publishMutation = useMutation({
    mutationFn: ({ id, publish }) => coursesAPI.publish(id, publish),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-courses'] }); toast.success('Updated') },
    onError: () => toast.error('Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => coursesAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-courses'] }); toast.success('Course deleted') },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  })

  const handleDelete = (course) => {
    if (!window.confirm(`Delete "${course.title}"? This cannot be undone.`)) return
    deleteMutation.mutate(course._id)
  }

  const courses = data?.data?.courses || []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title">All Courses</h1>
        <p className="text-gray-500 mt-1">{courses.length} courses across all trainers</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4">
          {courses.map(course => (
            <div key={course._id} className="card flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                <BookOpen size={22} className="text-brand-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-800">{course.title}</h3>
                  {course.requires_voice_test && (
                    <span className="badge badge-coral text-xs flex items-center gap-1">
                      <Mic size={10} /> Voice
                    </span>
                  )}
                  <span className={`badge text-xs ${course.is_published ? 'badge-green' : 'badge-gray'}`}>
                    {course.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  By {course.created_by?.name} · {course.video_source}
                  {course.category_id?.name && ` · ${course.category_id.name}`}
                  {course.transcript_status === 'ready' && ' · Transcript ready'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => publishMutation.mutate({ id: course._id, publish: !course.is_published })}
                  disabled={publishMutation.isPending}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors disabled:opacity-40 ${course.is_published
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                >
                  {course.is_published
                    ? <><EyeOff size={12} /> Unpublish</>
                    : <><Globe size={12} /> Publish</>}
                </button>
                <button
                  onClick={() => handleDelete(course)}
                  disabled={deleteMutation.isPending}
                  className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                  title="Delete course"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {!courses.length && (
            <div className="text-center py-20 text-gray-400">
              <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
              <p>No courses yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}