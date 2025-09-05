const Attendance = require('../models/Attendance');
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Settings = require('../models/Settings');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const putAttendance = async (req, res) => {
    try {
        const { rfid, subdomain } = req.body;

        if (!subdomain || subdomain === 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

        if (!rfid || rfid === '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        const worker = await Worker.findOne({ subdomain, rfid });
        if (!worker) {
            res.status(404);
            throw new Error('Worker not found');
        }

        const department = await Department.findById(worker.department);
        if (!department) {
            res.status(404);
            throw new Error('Department not found');
        }

        const indiaTimezoneDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const indiaTimezoneTime = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });

        const currentDateFormatted = indiaTimezoneDate.format(new Date());
        const currentTimeFormatted = indiaTimezoneTime.format(new Date());

        // Check if the last punch was less than 2 minutes ago
        const lastAttendance = await Attendance.findOne({ rfid, subdomain }).sort({ createdAt: -1 });
        
        if (lastAttendance) {
            const lastPunchTime = new Date(lastAttendance.createdAt);
            const currentTimeObj = new Date();
            
            // Calculate time difference in minutes
            const timeDifference = (currentTimeObj - lastPunchTime) / (1000 * 60);
            
            if (timeDifference < 2) {
                const remainingTime = Math.ceil(2 - timeDifference);
                res.status(429); // Too Many Requests
                throw new Error(`Please wait ${remainingTime} more minute(s) before punching again. Minimum interval between punches is 2 minutes.`);
            }
        }

        let newPresence;
        if (!lastAttendance) {
            newPresence = true;
        } else {
            newPresence = !lastAttendance.presence;

            const lastPunchDateFormatted = indiaTimezoneDate.format(lastAttendance.date);

            if (newPresence === true && lastAttendance.presence === true && lastPunchDateFormatted !== currentDateFormatted) {
                const defaultEndOfDayTime = '19:00:00 PM';

                await Attendance.create({
                    name: worker.name,
                    username: worker.username,
                    rfid,
                    subdomain,
                    department: department._id,
                    departmentName: department.name,
                    photo: worker.photo,
                    date: lastAttendance.date,
                    time: defaultEndOfDayTime,
                    presence: false,
                    worker: worker._id,
                    isMissedOutPunch: true,
                    attendanceMethod: 'rfid'
                });
                console.log(`Auto-generated OUT for ${worker.name} on ${lastPunchDateFormatted} due to missed punch.`);
            }
        }

        const newAttendance = await Attendance.create({
            name: worker.name,
            username: worker.username,
            rfid,
            subdomain,
            department: department._id,
            departmentName: department.name,
            photo: worker.photo,
            date: currentDateFormatted,
            time: currentTimeFormatted,
            presence: newPresence,
            worker: worker._id,
            attendanceMethod: 'rfid'
        });

        res.status(201).json({
            message: newPresence ? 'Attendance marked as in' : 'Attendance marked as out',
            attendance: newAttendance
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const putRfidAttendance = async (req, res) => {
    try {
        const { rfid } = req.body;

        if (!rfid || rfid === '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        const worker = await Worker.findOne({ rfid });
        if (!worker) {
            res.status(404);
            throw new Error('Worker not found');
        }

        const { subdomain } = worker;

        const department = await Department.findById(worker.department);
        if (!department) {
            res.status(404);
            throw new Error('Department not found');
        }

        const indiaTimezone = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        const currentDate = indiaTimezone.format(new Date());
        const currentTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' });

        const allAttendances = await Attendance.find({ rfid, subdomain }).sort({ createdAt: -1 });

        // Check if the last punch was less than 2 minutes ago
        if (allAttendances.length > 0) {
            const lastAttendance = allAttendances[0];
            const lastPunchTime = new Date(lastAttendance.createdAt);
            const currentTimeObj = new Date();
            
            // Calculate time difference in minutes
            const timeDifference = (currentTimeObj - lastPunchTime) / (1000 * 60);
            
            if (timeDifference < 2) {
                const remainingTime = Math.ceil(2 - timeDifference);
                res.status(429); // Too Many Requests
                throw new Error(`Please wait ${remainingTime} more minute(s) before punching again. Minimum interval between punches is 2 minutes.`);
            }
        }

        let presence = true;
        if (allAttendances.length > 0) {
            const lastAttendance = allAttendances[0];
            presence = !lastAttendance.presence;
        }

        const newAttendance = await Attendance.create({
            name: worker.name,
            username: worker.username,
            rfid,
            subdomain: subdomain,
            department: department._id,
            departmentName: department.name,
            photo: worker.photo,
            date: currentDate,
            time: currentTime,
            presence,
            worker: worker._id,
            attendanceMethod: 'rfid'
        });

        res.status(201).json({
            message: presence ? 'Attendance marked as in' : 'Attendance marked as out',
            attendance: newAttendance
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getAttendance = async (req, res) => {
    try {
        const { subdomain } = req.body;

        if (!subdomain || subdomain == 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

        const attendanceData = await Attendance.find({ subdomain }).populate('worker');

        res.status(200).json({ message: 'Attendance data retrieved successfully', attendance: attendanceData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getWorkerAttendance = async (req, res) => {
    try {
        const { rfid, subdomain } = req.body;

        if (!subdomain || subdomain == 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

        if (!rfid || rfid == '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        const workerAttendance = await Attendance.find({ rfid, subdomain });

        res.status(200).json({ message: 'Worker attendance data retrieved successfully', attendance: workerAttendance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const faceAttendance = async (req, res) => {
  const { subdomain, latitude, longitude, accuracy } = req.body;
  const image = req.file;

  console.log('=== FACE ATTENDANCE REQUEST ===');
  console.log('Subdomain:', subdomain);
  console.log('User role:', req.user?.role);
  console.log('User ID:', req.user?._id);
  console.log('Image received:', image ? 'Yes' : 'No');
  console.log('Location data:', { latitude, longitude, accuracy });
  if (image) {
    console.log('Image path:', image.path);
    console.log('Image size:', image.size);
  }

  if (!image) {
    return res.status(400).json({ message: 'No image file uploaded' });
  }

  if (!subdomain || subdomain === 'main') {
    return res.status(401).json({ message: 'Company name is missing, login again' });
  }
  
  // Verify location if coordinates are provided AND user is a worker
  let locationVerification = { verified: true, distance: null };
  if (req.user.role === 'worker' && latitude && longitude) {
    console.log('Verifying location for worker:', { latitude, longitude });
    locationVerification = await verifyLocation(latitude, longitude, subdomain);
    console.log('Location verification result:', locationVerification);
    
    if (!locationVerification.verified) {
      return res.status(403).json({
        message: locationVerification.message || 'You are not at the work location',
        locationError: true,
        distance: locationVerification.distance
      });
    }
  } else if (req.user.role === 'worker') {
    console.log('No location data provided for worker attendance verification');
  } else {
    console.log('Admin user - skipping location verification');
  }

  // For worker-specific attendance, only check against the logged-in worker's face encoding
  let workers = [];
  if (req.user.role === 'worker') {
    // Worker can only mark attendance for themselves
    const worker = await Worker.findOne({ _id: req.user._id, subdomain, faceEncoding: { $ne: null } });
    if (!worker) {
      return res.status(404).json({ 
        message: 'Worker face data not found. Please contact administrator to enroll your face.',
        isUnsavedFace: true
      });
    }
    workers = [worker];
    console.log(`Checking face match for specific worker: ${worker.name}`);
  } else {
    // Admin can check against all workers
    workers = await Worker.find({ subdomain, faceEncoding: { $ne: null } });
    console.log(`Found ${workers.length} workers with face encodings for admin check`);
  }

  if (workers.length === 0) {
    return res.status(404).json({ message: 'No workers with face encodings found for this company' });
  }

  const imagePath = image.path;
  
  try {
    // Step 1: Generate face encoding from uploaded image with improved validation
    const encodeProcess = spawn('python3', [path.join(__dirname, '../face_recognition_service.py'), 'encode', imagePath]);
    let encodeOutput = '';
    let encodeErrorOutput = '';

    encodeProcess.stdout.on('data', (data) => {
      encodeOutput += data.toString();
    });

    encodeProcess.stderr.on('data', (data) => {
      encodeErrorOutput += data.toString();
    });

    encodeProcess.on('close', async (encodeCode) => {
      // Clean up uploaded image
      try {
        fs.unlinkSync(imagePath);
      } catch (cleanupError) {
        console.error('Error cleaning up image file:', cleanupError);
      }
      
      if (encodeCode !== 0) {
        console.error(`Face encoding failed with code ${encodeCode}:`, encodeErrorOutput);
        
        // Parse error message from Python script
        let errorMessage = 'Failed to process face image';
        try {
          const errorData = JSON.parse(encodeErrorOutput);
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (parseError) {
          // Use default error message if parsing fails
        }
        
        return res.status(400).json({ message: errorMessage });
      }

      let unknownEncoding;
      try {
        unknownEncoding = JSON.parse(encodeOutput);
        if (!unknownEncoding || !Array.isArray(unknownEncoding)) {
          throw new Error('Invalid face encoding generated');
        }
        
        // Additional validation of the unknown encoding
        // Check for NaN or infinite values
        const hasInvalidValues = unknownEncoding.some(val => !isFinite(val));
        if (hasInvalidValues) {
          console.error('Invalid values found in face encoding');
          return res.status(400).json({ message: 'Invalid face encoding generated. Please try again.' });
        }
        
        // Check encoding variance (too low variance might indicate poor quality)
        const variance = calculateVariance(unknownEncoding);
        if (variance < 0.001) {
          console.error('Low variance in face encoding:', variance);
          return res.status(400).json({ 
            message: 'Low quality face encoding detected. Please ensure good lighting and try again.',
            suggestion: 'Try adjusting your position or lighting for better recognition.'
          });
        }
      } catch (parseError) {
        console.error('Error parsing face encoding:', parseError);
        return res.status(500).json({ message: 'Failed to process face encoding' });
      }

      // Step 2: Compare with stored encodings using improved distance calculation
      let bestMatch = -1;
      let bestDistance = Infinity;
      // Adjusted thresholds for stricter recognition - prevent false positives
      const FACE_RECOGNITION_THRESHOLD = 0.3; // Stricter threshold to prevent unsaved faces
      const MINIMUM_CONFIDENCE_REQUIRED = 0.7; // Higher confidence requirement
      
      // Enhanced comparison using multiple distance metrics
      console.log(`Comparing unknown face with ${workers.length} registered workers`);
      for (let i = 0; i < workers.length; i++) {
        const storedEncoding = workers[i].faceEncoding;
        if (!storedEncoding || !Array.isArray(storedEncoding)) {
          console.log(`Skipping worker ${workers[i].name} - invalid encoding`);
          continue;
        }
        
        // Calculate Euclidean distance
        let euclideanDistance = 0;
        const minLength = Math.min(unknownEncoding.length, storedEncoding.length);
        
        for (let j = 0; j < minLength; j++) {
          euclideanDistance += Math.pow(unknownEncoding[j] - storedEncoding[j], 2);
        }
        euclideanDistance = Math.sqrt(euclideanDistance);
        
        // Calculate cosine similarity for additional validation
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let j = 0; j < minLength; j++) {
          dotProduct += unknownEncoding[j] * storedEncoding[j];
          normA += unknownEncoding[j] * unknownEncoding[j];
          normB += storedEncoding[j] * storedEncoding[j];
        }
        
        const cosineSimilarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        const cosineDistance = 1 - cosineSimilarity;
        
        // Combine both distance metrics for better accuracy
        const combinedDistance = (euclideanDistance + cosineDistance) / 2;
        
        // Log comparison details for debugging
        console.log(`Comparing with worker ${workers[i].name}: combinedDistance=${combinedDistance.toFixed(4)}, threshold=${FACE_RECOGNITION_THRESHOLD}`);
        
        if (combinedDistance < FACE_RECOGNITION_THRESHOLD && combinedDistance < bestDistance) {
          bestDistance = combinedDistance;
          bestMatch = i;
          console.log(`New best match: ${workers[i].name} with distance ${combinedDistance.toFixed(4)}`);
        }
      }

      if (bestMatch === -1) {
        console.log('No face match found below threshold - UNREGISTERED FACE DETECTED');
        // Always return error for unknown faces - never allow attendance
        return res.status(404).json({ 
          message: 'Unregistered face detected. Face not enrolled in the system.',
          suggestion: 'Contact your administrator to enroll your face for attendance marking.',
          isUnsavedFace: true
        });
      }
      
      // Calculate confidence score (higher is better)
      const confidence = 1 - bestDistance;
      console.log(`Best match: ${workers[bestMatch]?.name}, distance: ${bestDistance.toFixed(4)}, confidence: ${confidence.toFixed(4)}`);
      
      // Additional validation: Check if this is likely to be a false positive
      // If the confidence is not significantly higher than the threshold, reject the match
      const CONFIDENCE_MARGIN = 0.15; // Increased margin for stricter validation
      if (confidence < (MINIMUM_CONFIDENCE_REQUIRED + CONFIDENCE_MARGIN)) {
        console.log(`Face match rejected due to insufficient confidence margin: ${confidence.toFixed(3)}, required with margin: ${(MINIMUM_CONFIDENCE_REQUIRED + CONFIDENCE_MARGIN).toFixed(3)} - POSSIBLE IMPERSONATION ATTEMPT`);
        // Always return error for low confidence matches - never allow attendance
        return res.status(404).json({
          message: 'Face verification failed. Confidence level is too low for secure identification.',
          suggestion: 'Please ensure good lighting and proper face positioning. If problem persists, contact administrator.',
          isUnsavedFace: true,
          confidence: confidence.toFixed(3),
          reason: 'Insufficient confidence for reliable face recognition'
        });
      }
      
      // Check if the match is confident enough - this prevents unsaved faces from falsely matching
      if (confidence < MINIMUM_CONFIDENCE_REQUIRED) {
        console.log(`Face match found but confidence too low: ${confidence.toFixed(3)}, required: ${MINIMUM_CONFIDENCE_REQUIRED} - LIKELY UNREGISTERED FACE`);
        // Always return error for low confidence matches - never allow attendance
        return res.status(404).json({
          message: 'Face verification failed. This face is not recognized as a registered employee.',
          suggestion: 'If you are a registered employee, please try again with better lighting or positioning.',
          isUnsavedFace: true,
          confidence: confidence.toFixed(3)
        });
      }
      
      console.log(`Accepting face match for ${workers[bestMatch].name} with confidence ${confidence.toFixed(4)}`);
      const matchedWorker = await Worker.findById(workers[bestMatch]._id).populate('department', 'name');

      if (!matchedWorker) {
          return res.status(404).json({ message: 'Matched worker not found in database' });
      }
      
      // Additional verification for worker-specific attendance
      if (req.user.role === 'worker' && req.user._id.toString() !== matchedWorker._id.toString()) {
        console.log(`SECURITY ALERT: Worker ${req.user.name} attempted to mark attendance as ${matchedWorker.name}`);
        return res.status(403).json({
          message: 'Security verification failed. You can only mark your own attendance.',
          isUnsavedFace: true
        });
      }
      
      // Check if the last punch was less than 2 minutes ago
      const lastAttendance = await Attendance.findOne({ rfid: matchedWorker.rfid, subdomain }).sort({ createdAt: -1 });
      
      if (lastAttendance) {
          const lastPunchTime = new Date(lastAttendance.createdAt);
          const currentTimeObj = new Date();
          
          // Calculate time difference in minutes
          const timeDifference = (currentTimeObj - lastPunchTime) / (1000 * 60);
          
          if (timeDifference < 2) {
              const remainingTime = Math.ceil(2 - timeDifference);
              return res.status(429).json({ 
                  message: `Please wait ${remainingTime} more minute(s) before punching again. Minimum interval between punches is 2 minutes.`,
                  suggestion: 'Wait for the required time interval before attempting to mark attendance again.'
              });
          }
      }
      
      // Final verification - double check the face encoding
      // This acts as a failsafe even if thresholds were somehow bypassed
      const matchesThisWorker = confidence > MINIMUM_CONFIDENCE_REQUIRED + 0.1;
      if (!matchesThisWorker) {
        console.log(`SECURITY ALERT: Final verification failed for ${matchedWorker.name} - confidence too low: ${confidence.toFixed(3)}`);
        return res.status(404).json({
          message: 'Face verification failed in final security check.',
          suggestion: 'Please try again with better lighting and positioning.',
          isUnsavedFace: true
        });
      }
      
      console.log(`Face recognition match found: ${matchedWorker.name} (confidence: ${confidence.toFixed(3)})`);
      
      // Proceed with attendance logging for the matched worker
      const indiaTimezoneDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
      });
      const indiaTimezoneTime = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
      });

      const currentDateFormatted = indiaTimezoneDate.format(new Date());
      const currentTimeFormatted = indiaTimezoneTime.format(new Date());

      const lastAttendanceRecord = await Attendance.findOne({ rfid: matchedWorker.rfid, subdomain }).sort({ createdAt: -1 });

      let newPresence;
      if (!lastAttendanceRecord) {
          newPresence = true;
      } else {
          newPresence = !lastAttendanceRecord.presence;

          const lastPunchDateFormatted = indiaTimezoneDate.format(lastAttendanceRecord.date);
          if (newPresence === true && lastAttendanceRecord.presence === true && lastPunchDateFormatted !== currentDateFormatted) {
              const defaultEndOfDayTime = '19:00:00 PM';
              await Attendance.create({
                  name: matchedWorker.name,
                  username: matchedWorker.username,
                  rfid: matchedWorker.rfid,
                  subdomain,
                  department: matchedWorker.department._id,
                  departmentName: matchedWorker.department.name,
                  photo: matchedWorker.photo,
                  date: lastAttendanceRecord.date,
                  time: defaultEndOfDayTime,
                  presence: false,
                  worker: matchedWorker._id,
                  isMissedOutPunch: true,
                  attendanceMethod: 'face_recognition'
              });
              console.log(`Auto-generated OUT for ${matchedWorker.name} on ${lastPunchDateFormatted} due to missed punch.`);
          }
      }

      const newAttendance = await Attendance.create({
          name: matchedWorker.name,
          username: matchedWorker.username,
          rfid: matchedWorker.rfid,
          subdomain,
          department: matchedWorker.department._id,
          departmentName: matchedWorker.department.name,
          photo: matchedWorker.photo,
          date: currentDateFormatted,
          time: currentTimeFormatted,
          presence: newPresence,
          worker: matchedWorker._id,
          recognitionConfidence: parseFloat(confidence.toFixed(3)),
          attendanceMethod: 'face_recognition',
          location: latitude && longitude ? {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            accuracy: parseFloat(accuracy) || null,
            verified: req.user.role === 'worker' && locationVerification.verified, // Only mark as verified for workers who passed verification
            distanceFromWork: locationVerification?.distance || null
          } : null
      });

      res.status(201).json({
          message: newPresence ? 
            `Welcome ${matchedWorker.name}! Attendance marked as IN` : 
            `Goodbye ${matchedWorker.name}! Attendance marked as OUT`,
          attendance: newAttendance,
          worker: {
              name: matchedWorker.name,
              department: matchedWorker.department.name,
              photo: matchedWorker.photo
          },
          confidence: confidence.toFixed(3)
      });
    });
  } catch (err) {
    // Clean up uploaded image in case of error
    try {
      fs.unlinkSync(imagePath);
    } catch (cleanupError) {
      console.error('Error cleaning up image file:', cleanupError);
    }
    
    console.error('Error during face attendance:', err);
    res.status(500).json({ message: 'Server error during face recognition' });
  }
};

// Helper function to calculate variance of an array
function calculateVariance(arr) {
  const mean = arr.reduce((sum, value) => sum + value, 0) / arr.length;
  const squaredDifferences = arr.map(value => Math.pow(value - mean, 2));
  const variance = squaredDifferences.reduce((sum, value) => sum + value, 0) / arr.length;
  return variance;
}

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // in meters

  return distance;
}

// Helper function to verify worker's location against work location
async function verifyLocation(latitude, longitude, subdomain) {
  if (!latitude || !longitude) {
    return { verified: false, message: "Location data missing" };
  }

  try {
    // Get company settings with work location
    const settings = await Settings.findOne({ subdomain });
    
    if (!settings || !settings.workLocation || !settings.workLocation.enabled) {
      return { verified: true, message: "Location verification not enabled" };
    }
    
    const { workLocation } = settings;
    
    if (!workLocation.latitude || !workLocation.longitude) {
      return { verified: true, message: "Work location not configured" };
    }
    
    // Calculate distance from work location
    const distance = calculateDistance(
      latitude, 
      longitude, 
      workLocation.latitude, 
      workLocation.longitude
    );
    
    const radius = workLocation.radius || 100; // Default to 100m if not specified
    
    // Return verification result
    if (distance <= radius) {
      return { 
        verified: true, 
        distance,
        message: "Location verified successfully" 
      };
    } else {
      return { 
        verified: false, 
        distance,
        message: `You are ${Math.round(distance)}m away from work location. Must be within ${radius}m.` 
      };
    }
  } catch (error) {
    console.error('Location verification error:', error);
    // Default to allowing attendance if verification fails
    return { verified: true, message: "Location verification error", error };
  }
}

// New function to check if worker is at correct location
const checkWorkerLocation = async (req, res) => {
  try {
    const { subdomain } = req.body;
    const { latitude, longitude } = req.body;

    // Only workers should be able to check location
    if (req.user.role !== 'worker') {
      return res.status(403).json({ 
        message: 'Only workers can check location for attendance',
        allowed: false 
      });
    }

    // Verify location
    const locationVerification = await verifyLocation(latitude, longitude, subdomain);
    
    if (locationVerification.verified) {
      return res.status(200).json({ 
        message: 'Location verified successfully',
        allowed: true,
        distance: locationVerification.distance
      });
    } else {
      return res.status(403).json({ 
        message: locationVerification.message || 'Wrong location',
        allowed: false,
        distance: locationVerification.distance
      });
    }
  } catch (error) {
    console.error('Location check error:', error);
    res.status(500).json({ 
      message: 'Server error during location check',
      allowed: false 
    });
  }
};

module.exports = { putAttendance, putRfidAttendance, getAttendance, getWorkerAttendance, faceAttendance, checkWorkerLocation };