-- ============================================================
-- LMS Platform — PostgreSQL Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- DEPARTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  requires_voice_test BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default departments
INSERT INTO departments (name, requires_voice_test) VALUES
  ('Sales', TRUE),
  ('Operations', FALSE),
  ('Marketing', FALSE),
  ('HR', FALSE),
  ('Finance', FALSE),
  ('Product', FALSE),
  ('Engineering', FALSE)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'trainer', 'trainee')),
  department_ids UUID[] DEFAULT '{}',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default admin user (password: Admin@123)
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Platform Admin',
  'admin@lms.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- Admin@123
  'admin'
) ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  trainer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  department_ids UUID[] DEFAULT '{}',
  video_url TEXT,
  video_source VARCHAR(20) CHECK (video_source IN ('youtube', 'gumlet', 'unknown')),
  gumlet_asset_id VARCHAR(255),
  transcript TEXT,
  transcript_status VARCHAR(20) DEFAULT 'pending' 
    CHECK (transcript_status IN ('pending', 'processing', 'ready', 'failed')),
  requires_voice_test BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE,
  passing_score INTEGER DEFAULT 70,
  estimated_duration_minutes INTEGER,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ENROLLMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  status VARCHAR(20) DEFAULT 'enrolled' 
    CHECK (status IN ('enrolled', 'in_progress', 'completed', 'failed')),
  UNIQUE (trainee_id, course_id)
);

-- ============================================================
-- TESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  test_type VARCHAR(20) NOT NULL CHECK (test_type IN ('written', 'voice')),
  questions JSONB NOT NULL DEFAULT '[]',
  -- questions format: [{ id, question, type (mcq|short), options?, correct_answer, rubric? }]
  time_limit_minutes INTEGER,
  max_attempts INTEGER DEFAULT 3,
  passing_score INTEGER DEFAULT 70,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATTEMPTS (written tests)
-- ============================================================
CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id),
  attempt_type VARCHAR(20) NOT NULL CHECK (attempt_type IN ('written', 'voice')),
  
  -- Written test fields
  answers JSONB DEFAULT '[]',
  -- answers format: [{ question_id, answer, score, feedback }]
  
  -- Voice test fields
  pinecone_id VARCHAR(255),           -- bridge to Pinecone vector
  transcript TEXT,                     -- AssemblyAI transcript
  audio_s3_key TEXT,                  -- S3/R2 key for raw audio
  
  -- Scoring
  score NUMERIC(5,2),
  max_score NUMERIC(5,2) DEFAULT 100,
  passed BOOLEAN,
  ai_feedback TEXT,
  ai_rubric_breakdown JSONB,
  
  -- Timing
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) DEFAULT 'info' 
    CHECK (type IN ('info', 'success', 'warning', 'error', 'test_result', 'enrollment')),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_enrollments_trainee ON enrollments(trainee_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_attempts_trainee ON attempts(trainee_id);
CREATE INDEX IF NOT EXISTS idx_attempts_test ON attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_courses_trainer ON courses(trainer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tests_updated_at BEFORE UPDATE ON tests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
