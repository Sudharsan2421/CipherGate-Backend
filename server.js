const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');

// Load env vars first
dotenv.config();

// Connect to database
connectDB();

// Routes
const authRoutes = require('./routes/authRoutes');
const attendanceRoutes = require('./routes/attedanceRoutes');
const workerRoutes = require('./routes/workerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const taskRoutes = require('./routes/taskRoutes');
const topicRoutes = require('./routes/topicRoutes');
const commentRoutes = require('./routes/commentRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const columnRoutes = require('./routes/columnRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const foodRequestRoutes = require('./routes/foodRequestRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const app = express();

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://tvtasks.netlify.app',
      'https://client-seven-ruby.vercel.app',
      'https://client-santhoshsekar999-gmailcoms-projects.vercel.app',
      'https://cipher-gate-frontend.vercel.app' // ** Added this line for the new Vercel URL **
    ];
    const regex = /^http:\/\/.*\.localhost:3000$/; // Allow subdomains of localhost:3000

    if (!origin || allowedOrigins.includes(origin) || regex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests globally
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/columns', columnRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/food-requests', foodRequestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);

// Route for checking API status
app.get('/', (req, res) => {
  res.json({ message: 'Task Tracker API is running' });
});

// Initialize schedulers and cron jobs
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULERS === 'true') {
  console.log('🚀 Starting production schedulers...');
  
  // Initialize food request schedulers
  const { initializeFoodRequestSchedulers } = require('./schedulers/foodRequestScheduler');
  initializeFoodRequestSchedulers();
  
  // Initialize other cron jobs if they exist
  const { startCronJobs } = require('./services/cronJobs');
  startCronJobs();
} else {
  console.log('⚠️ Schedulers disabled. Set NODE_ENV=production or ENABLE_SCHEDULERS=true to enable');
}

// Error handler (should be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🌟 Server running on port ${PORT}`);
  console.log(`📧 Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
  console.log(`🗄️ Database: ${process.env.MONGO_URI ? 'Connected' : 'Not configured'}`);
});
