require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { connect } = require('./src/config/db');

const app = express();

process.on('unhandledRejection', (reason) => {
  console.error('[process:unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[process:uncaughtException]', {
    message: err.message,
    stack: err.stack,
  });
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(compression({ threshold: 1024 }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  req.requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    if (res.statusCode >= 400 || durationMs > 3000) {
      console.warn('[request]', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
        userId: req.user?._id?.toString?.() || null,
      });
    }
  });

  next();
});

app.use('/api/ai', require('./src/routes/ai'));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/courses', require('./src/routes/courses'));
app.use('/api/tests', require('./src/routes/tests'));
app.use('/api/attempts', require('./src/routes/attempts'));
app.use('/api/enrollments', require('./src/routes/enrollments'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/categories', require('./src/routes/categories'));
app.use('/api/voice-test', require('./src/routes/VoiceTest'));
app.use('/api/whatsapp', require('./src/routes/whatsapp'));
app.use('/api/recommendations', require('./src/routes/recommendations'));
app.use('/api/modules', require('./src/routes/modules'));
app.use('/api/lessons', require('./src/routes/lessons'));
app.use('/api/lesson-progress', require('./src/routes/lessonProgress'));
app.use('/api/role-play', require('./src/routes/rolePlay'));

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  console.error('[api:error]', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    userId: req.user?._id?.toString?.() || null,
    message: err.message,
    stack: err.stack,
  });
  res.status(status).json({
    success: false,
    requestId: req.requestId,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connect();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

if (require.main === module) {
  start().catch((err) => {
    console.error('[server:start_failed]', {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });
}

module.exports = app;
