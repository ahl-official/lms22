import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { coursesAPI, usersAPI } from '../../services/api'
import { ChevronLeft, Save } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CreateCourse() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState({
    title: '',
    description: '',
    passing_score: 60,
    duration_hours: '',
    tags: '',
    department_ids: [],
  })
  const [saving, setSaving] = useState(false)

  const { data: courseData } = useQuery({
    queryKey: ['course-edit', id],
    queryFn: () => coursesAPI.getOne(id),
    enabled: isEdit,
  })

  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => usersAPI.getDepartments(),
  })

  useEffect(() => {
    if (courseData?.data?.course) {
      const c = courseData.data.course
      setForm({
        title: c.title || '',
        description: c.description || '',
        passing_score: c.passing_score || 60,
        duration_hours: c.duration_hours || '',
        tags: c.tags?.join(', ') || '',
        department_ids: c.department_ids?.map(d => d._id || d) || [],
      })
    }
  }, [courseData])

  const departments = deptsData?.data?.departments || []
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Title is required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        duration_hours: form.duration_hours ? Number(form.duration_hours) : null,
      }
      if (isEdit) {
        await coursesAPI.update(id, payload)
        toast.success('Course updated')
      } else {
        await coursesAPI.create(payload)
        toast.success('Course created — now add modules with videos and tests!')
      }
      navigate('/trainer/courses')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={() => navigate('/trainer/courses')}
        className="flex items-center gap-1 text-gray-500 hover:text-brand-600 text-sm mb-6 transition-colors">
        <ChevronLeft size={16} /> Back to courses
      </button>

      <h1 className="page-title mb-2">{isEdit ? 'Edit Course' : 'New Course'}</h1>
      <p className="text-sm text-gray-500 mb-8">
        {isEdit
          ? 'Update course details. Videos and tests are managed per module.'
          : 'Create the course shell first. After saving, add modules — each module has its own video, transcript, and tests.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-700">Course Details</h2>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Title *</label>
            <input className="input-field" placeholder="e.g. Sales Fundamentals 101"
              value={form.title} onChange={e => set('title', e.target.value)} required />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Description</label>
            <textarea className="input-field min-h-[90px] resize-none"
              placeholder="What will trainees learn in this course?"
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Passing Score (%)</label>
              <input type="number" className="input-field" min={0} max={100}
                value={form.passing_score} onChange={e => set('passing_score', Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Duration (hours)</label>
              <input type="number" className="input-field" min={0} step={0.5} placeholder="e.g. 2.5"
                value={form.duration_hours} onChange={e => set('duration_hours', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Tags</label>
              <input className="input-field" placeholder="sales, communication"
                value={form.tags} onChange={e => set('tags', e.target.value)} />
            </div>
          </div>
        </div>

        {departments.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-gray-700 mb-3">Departments</h2>
            <div className="flex flex-wrap gap-2">
              {departments.map(d => {
                const selected = form.department_ids.includes(d._id)
                return (
                  <button type="button" key={d._id}
                    onClick={() => set('department_ids', selected
                      ? form.department_ids.filter(x => x !== d._id)
                      : [...form.department_ids, d._id])}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${selected ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-brand-200'
                      }`}>
                    {d.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/trainer/courses')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Course'}
          </button>
        </div>
      </form>
    </div>
  )
}