const express = require('express');
const { putAttendance, getAttendance, getWorkerAttendance, putRfidAttendance, faceAttendance, checkWorkerLocation } = require('../controllers/attendanceController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.put('/', putAttendance);
router.post('/', getAttendance);
router.post('/rfid', putRfidAttendance);
router.post('/worker', getWorkerAttendance);
router.post('/check-location', protect, checkWorkerLocation);
router.post('/face', protect, upload.single('face_photo'), faceAttendance);

module.exports = router;