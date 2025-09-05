const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const { 
  getWorkers, 
  createWorker, 
  getWorkerById, 
  updateWorker, 
  deleteWorker,
  getWorkerActivities,
  resetWorkerActivities,
  getPublicWorkers,
  generateId,
  enrollFace,
  clearFacePhotos,
  deleteIndividualFacePhoto
} = require('../controllers/workerController');
const { protect, adminOnly, adminOrWorker } = require('../middleware/authMiddleware');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Generate a unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Enhanced file filter to log and accept only image files
const fileFilter = (req, file, cb) => {
  console.log('Received file:', {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
  });
  
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  }
});

router.route('/').post(protect, adminOnly, upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'facePhotos', maxCount: 5 }]), createWorker);
router.route('/all').post(protect, adminOrWorker, getWorkers);
router.route('/generate-id').get(protect, generateId);

router.post('/public', getPublicWorkers);
  
router.route('/:id')
  .get(protect, getWorkerById)
  .put(protect, adminOnly, upload.single('photo'), updateWorker)
  .delete(protect, adminOnly, deleteWorker);

router.route('/:id/activities')
  .get(protect, getWorkerActivities)
  .delete(protect, adminOnly, resetWorkerActivities);

// Face enrollment route
router.post('/enroll-face', protect, adminOnly, upload.single('face_photo'), enrollFace);

// Add this new route for clearing face photos
router.delete('/:id/face-photos', protect, adminOnly, clearFacePhotos);

// Add this new route for deleting individual face photos
router.delete('/:id/face-photos/:photoIndex', protect, adminOnly, deleteIndividualFacePhoto);

module.exports = router;