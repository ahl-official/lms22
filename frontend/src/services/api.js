import axios from 'axios'

let cachedAuthRaw = null
let cachedToken = null

const getAuthToken = () => {
  const raw = localStorage.getItem('lms-auth') || '{}'
  if (raw === cachedAuthRaw) return cachedToken
  cachedAuthRaw = raw
  try {
    cachedToken = JSON.parse(raw)?.state?.token || null
  } catch {
    cachedToken = null
  }
  return cachedToken
}

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(
  (config) => {
    const token = getAuthToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (err) => Promise.reject(err)
)

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('lms-auth')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
}

export const categoriesAPI = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
  getMembers: (id) => api.get(`/categories/${id}/members`),
  migrateCourses: () => api.post('/categories/migrate-courses'),
}

export const coursesAPI = {
  getAll: () => api.get('/courses'),
  getOne: (id) => api.get(`/courses/${id}`),
  create: (data) => api.post('/courses', data),
  update: (id, data) => api.put(`/courses/${id}`, data),
  delete: (id) => api.delete(`/courses/${id}`),
  publish: (id, publish) => api.put(`/courses/${id}/publish`, { publish }),
}

export const modulesAPI = {
  getByCourse: (courseId) => api.get(`/modules/course/${courseId}`),
  getOne: (id) => api.get(`/modules/${id}`),
  create: (data) => api.post('/modules', data),
  update: (id, data) => api.put(`/modules/${id}`, data),
  delete: (id) => api.delete(`/modules/${id}`),
  reorder: (id, order) => api.put(`/modules/${id}/reorder`, { order }),
  publish: (id, publish) => api.put(`/modules/${id}/publish`, { publish }),
  fetchTranscript: (id) => api.post(`/modules/${id}/fetch-transcript`),
  saveTranscript: (id, transcript) => api.put(`/modules/${id}/transcript`, { transcript }),
  generateTest: (id, data) => api.post(`/modules/${id}/generate-test`, data),
}

export const lessonsAPI = {
  getByCourse: (courseId) => api.get(`/lessons/course/${courseId}`),
  getByModule: (moduleId) => api.get(`/lessons/module/${moduleId}`),
  getOne: (id) => api.get(`/lessons/${id}`),
  create: (data) => api.post('/lessons', data),
  update: (id, data) => api.put(`/lessons/${id}`, data),
  delete: (id) => api.delete(`/lessons/${id}`),
  publish: (id, pub) => api.put(`/lessons/${id}/publish`, { publish: pub }),
  reorder: (id, order) => api.put(`/lessons/${id}/reorder`, { order }),
  fetchTranscript: (id) => api.post(`/lessons/${id}/fetch-transcript`),
  saveTranscript: (id, t) => api.put(`/lessons/${id}/transcript`, { transcript: t }),

  // Lesson-level test management
  getLessonTest: (id) => api.get(`/lessons/${id}/test`),
  generateLessonTest: (id, data) => api.post(`/lessons/${id}/test/generate`, data),
  approveLessonTest: (id) => api.put(`/lessons/${id}/test/approve`),
  updateLessonTest: (id, data) => api.put(`/lessons/${id}/test`, data),
  deleteLessonTest: (id) => api.delete(`/lessons/${id}/test`),

  // Lesson-level AI notes (cached on server)
  generateAINotes: (id, force = false) => api.post(`/lessons/${id}/ai-notes`, { force }),
}

export const lessonProgressAPI = {
  complete: (data) => api.post('/lesson-progress/complete', data),
  updateWatch: (data) => api.put('/lesson-progress/watch', data),
  getMy: () => api.get('/lesson-progress/my'),
  getByCourse: (courseId) => api.get(`/lesson-progress/course/${courseId}`),
  getTraineeCourse: (tid, cid) => api.get(`/lesson-progress/trainee/${tid}/course/${cid}`),
  getByModule: (moduleId) => api.get(`/lesson-progress/module/${moduleId}`),
}

export const testsAPI = {
  getByCourse: (courseId) => api.get(`/tests/course/${courseId}`),
  getByModule: (moduleId) => api.get(`/tests/module/${moduleId}`),
  getOne: (id) => api.get(`/tests/${id}`),
  create: (data) => api.post('/tests', data),
  update: (id, data) => api.put(`/tests/${id}`, data),
  delete: (id) => api.delete(`/tests/${id}`),
  approve: (id) => api.put(`/tests/${id}/approve`),
  unpublish: (id) => api.put(`/tests/${id}/unpublish`),
  reorder: (id, order) => api.put(`/tests/${id}/reorder`, { order }),
}

export const enrollmentsAPI = {
  enroll: (data) => api.post('/enrollments', data),
  bulkEnroll: (data) => api.post('/enrollments/bulk', data),
  getMy: () => api.get('/enrollments/my'),
  getByCourse: (courseId) => api.get(`/enrollments/course/${courseId}`),
  updateProgress: (id, data) => api.put(`/enrollments/${id}/progress`, data),
  remove: (id) => api.delete(`/enrollments/${id}`),
}

export const attemptsAPI = {
  submitWritten: (data) => api.post('/attempts/written', data),
  submitVoice: (formData) => api.post('/attempts/voice', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMy: () => api.get('/attempts/my'),
  getOne: (id) => api.get(`/attempts/${id}`),
  getRecordingUrl: (attemptId) => `/api/attempts/${attemptId}/recording`,
  getByCourseAndTrainee: (courseId, traineeId) => api.get(`/attempts/course/${courseId}/trainee/${traineeId}`),
}

export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getDepartments: () => api.get('/users/departments'),
  getOne: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.put(`/users/${id}`, data),
  toggleActive: (id) => api.put(`/users/${id}/toggle-active`),
  updateDepartments: (id, department_ids) => api.put(`/users/${id}/departments`, { department_ids }),
  assignCategory: (id, category_id) => api.put(`/users/${id}/category`, { category_id }),
  assignCategories: (id, category_ids) => api.put(`/users/${id}/categories`, { category_ids }),
  getPassword: (id) => api.get(`/users/${id}/password`),
  deleteUser: (id) => api.delete(`/users/${id}`),
  getNotifications: () => api.get('/users/notifications'),
  markAllRead: () => api.put('/users/notifications/read-all'),
}

export const analyticsAPI = {
  getOverview: () => api.get('/analytics/overview'),
  getTrainee: (id) => api.get(`/analytics/trainee/${id}`),
  getVoiceTrends: () => api.get('/analytics/voice-trends'),
  getModuleStats: (courseId) => api.get(`/analytics/modules/course/${courseId}`),
  getModuleTrainees: (moduleId) => api.get(`/analytics/modules/${moduleId}/trainees`),
  getHistory: (params) => api.get('/analytics/history', { params }),
  getStudentHistory: (params) => api.get('/analytics/student-history', { params }),
  getStudentProgress: (params) => api.get('/analytics/admin/student-progress', { params }),
}

export const voiceTestAPI = {
  start: (courseId, lessonId) => api.get(`/voice-test/start/${courseId}`, {
    params: lessonId ? { lesson_id: lessonId } : undefined,
  }),
  nextQuestion: (data) => api.post('/voice-test/next-question', data),
  evaluateAnswer: (data) => api.post('/voice-test/evaluate-answer', data),
  score: (data) => api.post('/voice-test/score', data),
}
export const rolePlayAPI = {
  getCourseProgress: (courseId, traineeId) => api.get(`/role-play/course/${courseId}/progress`, {
    params: traineeId ? { trainee_id: traineeId } : undefined,
  }),
  getLockedForTrainee: (traineeId) => api.get(`/role-play/locked/trainee/${traineeId}`),
  unlockCourse: (courseId, data) => api.put(`/role-play/course/${courseId}/unlock`, data),
  getProgress: (lessonId, traineeId) => api.get(`/role-play/progress/${lessonId}`, {
    params: traineeId ? { trainee_id: traineeId } : undefined,
  }),
  getMyHistory: (params) => api.get('/role-play/history/me', { params }),
  getTraineeHistory: (traineeId, params) => api.get(`/role-play/history/trainee/${traineeId}`, { params }),
  recordProgress: (data) => api.post('/role-play/progress', data),
  unlockProgress: (lessonId, data) => api.put(`/role-play/progress/${lessonId}/unlock`, data),
  getPersonas: (lessonId) => api.get(`/role-play/personas/${lessonId}`),
  startScenario: (data) => api.post('/role-play/scenario', data),
  sendTurn: (data) => api.post('/role-play/turn', data),
  sendAudioTurn: (formData) => api.post('/role-play/turn-audio', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getScenarioSummary: (data) => api.post('/role-play/summary', data),
}
export const aiAPI = {
  generateNotes: (data) => api.post('/ai/generate-notes', data),
}

export const recommendationsAPI = {
  generate: (data) => api.post('/recommendations/generate', data),
  getMy: () => api.get('/recommendations/my'),
  getPending: () => api.get('/recommendations/pending'),
  getAll: (params) => api.get('/recommendations/all', { params }),
  review: (id, data) => api.put(`/recommendations/${id}/review`, data),
}

export default api
