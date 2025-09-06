const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');

// Load env vars first
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Multer setup
const upload = multer();

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// CORS setup
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://tvtasks.netlify.app',
      'https://client-seven-ruby.vercel.app',
      'https://client-santhoshsekar999-gmailcoms-projects.vercel.app',
      'https://cipher-gate-frontend.vercel.app',
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
  credentials: true,
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests globally
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  console.log(`Received request: ${req.method} ${req.originalUrl}`);
  next();
});

// Serve static files from uploads directory (old local storage – optional now)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Cloudinary Upload Route
app.post('/api/upload-face', upload.single('file'), async (req, res) => {
  try {
    cloudinary.uploader
      .upload_stream({ folder: 'faces' }, (error, result) => {
        if (error) return res.status(500).json({ error });
        res.json({ url: result.secure_url });
      })
      .end(req.file.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mount routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/attendance', require('./routes/attedanceRoutes'));
app.use('/api/workers', require('./routes/workerRoutes'));
app.use('/api/salary', require('./routes/salaryRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/topics', require('./routes/topicRoutes'));
app.use('/api/comments', require('./routes/commentRoutes'));
app.use('/api/leaves', require('./routes/leaveRoutes'));
app.use('/api/columns', require('./routes/columnRoutes'));
app.use('/api/departments', require('./routes/departmentRoutes'));
app.use('/api/food-requests', require('./routes/foodRequestRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));

// Route for checking API status
app.get('/', (req, res) => {
  res.json({ message: 'Task Tracker API is running' });
});

// Initialize schedulers and cron jobs
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULERS === 'true') {
  console.log('🚀 Starting production schedulers...');
  
  const { initializeFoodRequestSchedulers } = require('./schedulers/foodRequestScheduler');
  initializeFoodRequestSchedulers();
  
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
