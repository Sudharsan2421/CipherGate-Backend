const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const Task = require('../models/Task');
const Attendance = require('../models/Attendance');
const Department = require('../models/Department');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const createWorker = asyncHandler(async (req, res) => {
  try {
    const { name, username, rfid, salary, password, subdomain, department, batch } = req.body;
    const files = req.files || {};
    const photoFile = files.photo ? files.photo[0] : null;
    const facePhotoFiles = files.facePhotos || [];

    console.log('=== CREATE WORKER DEBUG ===');
    console.log('Request body:', req.body);
    console.log('Files received:', files);
    console.log('Photo file:', photoFile ? photoFile.filename : 'None');
    console.log('Face photo files count:', facePhotoFiles.length);
    console.log('Face photo files:', facePhotoFiles.map(f => f.filename));

    // Make photo optional - only require other fields
    if (!name || !username || !rfid || !salary || !password || !subdomain || !department || !batch) {
      res.status(400);
      throw new Error('All fields except photo are required');
    }

    const perDaySalary = Number(salary) / 30;

    const workerExists = await Worker.findOne({ username });
    if (workerExists) {
      res.status(400);
      throw new Error('Worker with this username already exists');
    }

    const departmentDoc = await Department.findById(department);
    if (!departmentDoc) {
      res.status(400);
      throw new Error('Invalid department');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Process face photos if provided
    let facePhotos = [];
    let faceEncoding = null;
    
    if (facePhotoFiles.length > 0) {
      console.log(`Processing ${facePhotoFiles.length} face photos for ${name}`);
      
      for (let i = 0; i < facePhotoFiles.length; i++) {
        const faceFile = facePhotoFiles[i];
        const savedImageName = `face_${username}_${Date.now()}_${i}.jpg`;
        const savedImagePath = path.join(__dirname, '../uploads', savedImageName);
        
        try {
          // Move the file to permanent storage
          fs.renameSync(faceFile.path, savedImagePath);
          
          // Store the URL
          const imageUrl = `/uploads/${savedImageName}`;
          facePhotos.push(imageUrl);
          
          // Generate face encoding from the first face photo that produces a valid encoding
          if (!faceEncoding) {
            const pythonProcess = spawn('python3', [path.join(__dirname, '../face_recognition_service.py'), 'encode', savedImagePath]);
            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
              output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
              errorOutput += data.toString();
            });

            await new Promise((resolve, reject) => {
              pythonProcess.on('close', async (code) => {
                if (code !== 0) {
                  console.error(`Python script exited with code ${code}:`, errorOutput);
                  // Don't fail the entire process, just log the error
                  console.warn('Face encoding failed, trying next photo');
                  resolve();
                } else {
                  try {
                    const encoding = JSON.parse(output);
                    // Validate encoding before using it
                    if (encoding && Array.isArray(encoding) && encoding.length > 0) {
                      // Check for invalid values
                      const hasInvalidValues = encoding.some(val => !isFinite(val));
                      if (!hasInvalidValues) {
                        faceEncoding = encoding;
                        console.log(`Face encoding generated successfully from photo ${i+1}`);
                      } else {
                        console.warn(`Invalid values in encoding from photo ${i+1}, trying next photo`);
                      }
                    }
                    resolve();
                  } catch (parseError) {
                    console.error('Error parsing Python output:', parseError);
                    console.warn('Face encoding failed, trying next photo');
                    resolve();
                  }
                }
              });
            });
          }
        } catch (fileError) {
          console.error(`Error processing face photo ${i}:`, fileError);
          // Clean up the temporary file if it exists
          try {
            fs.unlinkSync(faceFile.path);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
        }
      }
    }

    // Handle profile photo if provided
    let profilePhoto = null;
    if (photoFile) {
      profilePhoto = photoFile.filename;
    }

    // Create worker with face photos and encoding
    const worker = await Worker.create({
      name,
      username,
      rfid,
      salary: Number(salary),
      finalSalary: Number(salary),
      perDaySalary,
      subdomain,
      password: hashedPassword,
      department: departmentDoc._id,
      batch,
      photo: profilePhoto,
      totalPoints: 0,
      facePhotos: facePhotos,
      faceEncoding: faceEncoding
    });

    console.log(`Worker created with ${facePhotos.length} face photos:`, facePhotos);
    console.log('Face photos saved to database:', worker.facePhotos);

    // Return response with properly formatted face photos
    res.status(201).json({
      _id: worker._id,
      name: worker.name,
      username: worker.username,
      salary: worker.salary,
      finalSalary: worker.finalSalary,
      perDaySalary: worker.perDaySalary,
      rfid: worker.rfid,
      subdomain: worker.subdomain,
      department: departmentDoc.name,
      batch: worker.batch,
      photo: worker.photo,
      photoUrl: worker.photo ? `/uploads/${worker.photo}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}`,
      facePhotos: worker.facePhotos || [],
      facePhotosCount: facePhotos.length,
      hasFaceRecognition: !!faceEncoding,
      message: `Employee created successfully with ${facePhotos.length} face photos`
    });

  } catch (error) {
    console.error('Worker Creation Error:', error);
    res.status(400);
    throw new Error(error.message || 'Failed to create worker');
  }
});

const generateUniqueRFID = async () => {
  const generateRFID = () => {
    const letters = String.fromCharCode(
      65 + Math.floor(Math.random() * 26),
      65 + Math.floor(Math.random() * 26)
    );
    const numbers = Math.floor(1000 + Math.random() * 9000).toString();
    return `${letters}${numbers}`;
  };

  let rfid;
  let isUnique = false;

  while (!isUnique) {
    rfid = await generateRFID();
    const existingWorker = await Worker.findOne({ rfid });
    if (!existingWorker) {
      isUnique = true;
    }
  }

  return rfid;
};

const generateId = asyncHandler(async (req, res) => {
  const rfid = await generateUniqueRFID();

  res.status(200).json({
    rfid: rfid,
    message: "ID was generated"
  });
});

const getWorkers = asyncHandler(async (req, res) => {
  try {
    const workers = await Worker.find({ subdomain: req.body.subdomain })
      .select('-password')
      .populate('department', 'name');

    const transformedWorkers = workers.map(worker => ({
      ...worker.toObject(),
      department: worker.department ? worker.department.name : 'Unassigned',
      photoUrl: worker.photo
        ? `/uploads/${worker.photo}`
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}`,
      facePhotos: worker.facePhotos ? worker.facePhotos.map(photoPath => {
        // Convert relative paths to full URLs if needed
        if (photoPath.startsWith('/uploads/')) {
          return photoPath; // Already a proper path
        } else if (photoPath.startsWith('uploads/')) {
          return `/${photoPath}`; // Add leading slash
        } else {
          return photoPath; // Use as is (might be full URL)
        }
      }) : [],
      hasFaceRecognition: !!(worker.faceEncoding && worker.facePhotos && worker.facePhotos.length > 0)
    }));

    res.json(transformedWorkers);
  } catch (error) {
    console.error('Get Workers Error:', error);
    res.status(500);
    throw new Error('Failed to retrieve workers');
  }
});
const getPublicWorkers = asyncHandler(async (req, res) => {
  try {
    const workers = await Worker.find({ subdomain: req.body.subdomain })
      .select('name username subdomain department photo')
      .populate('department', 'name');

    const transformedWorkers = workers.map(worker => ({
      _id: worker._id,
      name: worker.name,
      username: worker.username,
      subdomain: worker.subdomain,
      department: worker.department ? worker.department.name : 'Unassigned',
      photo: worker.photo
    }));

    res.json(transformedWorkers);
  } catch (error) {
    console.error('Get Public Workers Error:', error);
    res.status(500);
    throw new Error('Failed to retrieve workers');
  }
});
const getWorkerById = asyncHandler(async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id)
      .select('-password')
      .populate('department', 'name');

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    res.json(worker);
  } catch (error) {
    console.error('Get Worker by ID Error:', error);
    res.status(404);
    throw new Error(error.message || 'Worker not found');
  }
});

const updateWorker = asyncHandler(async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    const { name, username, salary, department, password, photo, batch, finalSalary } = req.body;
    const updateData = {};

    if (department) {
      const departmentExists = await Department.findById(department);
      if (!departmentExists) {
        res.status(400);
        throw new Error('Invalid department');
      }
      updateData.department = department;
    }

    if (name) updateData.name = name;
    if (batch) updateData.batch = batch;

    if (username) {
      const usernameExists = await Worker.findOne({
        username,
        _id: { $ne: req.params.id }
      });
      if (usernameExists) {
        res.status(400);
        throw new Error('Username already exists');
      }
      updateData.username = username;
    }

    if (photo) {
      updateData.photo = photo;
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    if (salary) {
      const numericSalary = Number(salary);
      if (isNaN(numericSalary) || numericSalary <= 0) {
        res.status(400);
        throw new Error('Invalid salary value');
      }

      updateData.salary = numericSalary;
      updateData.finalSalary = numericSalary;
      updateData.perDaySalary = numericSalary / 30;
    } else if (finalSalary) {
      const numericFinalSalary = Number(finalSalary);
      if (isNaN(numericFinalSalary)) {
        res.status(400);
        throw new Error('Invalid final salary value');
      }
      updateData.finalSalary = numericFinalSalary;
    }

    const updatedWorker = await Worker.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('department', 'name');

    res.json({
      _id: updatedWorker._id,
      name: updatedWorker.name,
      username: updatedWorker.username,
      salary: updatedWorker.salary,
      perDaySalary: updatedWorker.perDaySalary,
      finalSalary: updatedWorker.finalSalary,
      department: updatedWorker.department.name,
      batch: updatedWorker.batch,
      photo: updatedWorker.photo
    });
  } catch (error) {
    console.error('Update Worker Error:', error);
    res.status(400);
    throw new Error(error.message || 'Failed to update worker');
  }
});

const deleteWorker = asyncHandler(async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    // Delete associated files
    if (worker.photo) {
      const photoPath = path.join(__dirname, '../uploads', path.basename(worker.photo));
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }

    // Delete face photos
    if (worker.facePhotos && worker.facePhotos.length > 0) {
      worker.facePhotos.forEach(photo => {
        const photoPath = path.join(__dirname, '../uploads', path.basename(photo));
        if (fs.existsSync(photoPath)) {
          fs.unlinkSync(photoPath);
        }
      });
    }

    // Delete related Attendance records
    await Attendance.deleteMany({ worker: req.params.id });
    
    // Delete related Task records
    await Task.deleteMany({ worker: req.params.id });

    // Use findByIdAndDelete instead of deprecated remove() method
    await Worker.findByIdAndDelete(req.params.id);
    res.json({ message: 'Worker removed successfully' });
  } catch (error) {
    console.error('Delete Worker Error:', error);
    res.status(500);
    throw new Error('Failed to delete worker');
  }
});

// Add this new function to clear face photos
const clearFacePhotos = asyncHandler(async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    // Delete face photos from file system
    if (worker.facePhotos && worker.facePhotos.length > 0) {
      worker.facePhotos.forEach(photo => {
        const photoPath = path.join(__dirname, '../uploads', path.basename(photo));
        if (fs.existsSync(photoPath)) {
          fs.unlinkSync(photoPath);
        }
      });
    }

    // Clear face photos array and encoding
    worker.facePhotos = [];
    worker.faceEncoding = null;
    await worker.save();

    res.json({ message: 'Face photos cleared successfully' });
  } catch (error) {
    console.error('Clear Face Photos Error:', error);
    res.status(500);
    throw new Error('Failed to clear face photos');
  }
});

// Add this new function to delete an individual face photo
const deleteIndividualFacePhoto = asyncHandler(async (req, res) => {
  try {
    const { photoIndex } = req.params; // Get the index of the photo to delete from URL params
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    // Validate photo index
    const index = parseInt(photoIndex);
    if (isNaN(index) || index < 0 || index >= worker.facePhotos.length) {
      res.status(400);
      throw new Error('Invalid photo index');
    }

    // Delete the specific face photo from file system
    const photoToDelete = worker.facePhotos[index];
    const photoPath = path.join(__dirname, '../uploads', path.basename(photoToDelete));
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }

    // Remove the photo from the array
    worker.facePhotos.splice(index, 1);

    // If no face photos left, clear the encoding
    if (worker.facePhotos.length === 0) {
      worker.faceEncoding = null;
    }

    await worker.save();

    res.json({ 
      message: 'Face photo deleted successfully',
      remainingPhotos: worker.facePhotos.length
    });
  } catch (error) {
    console.error('Delete Individual Face Photo Error:', error);
    res.status(500);
    throw new Error('Failed to delete face photo');
  }
});

const getWorkerActivities = asyncHandler(async (req, res) => {
  try {
    const tasks = await Task.find({ worker: req.params.id })
      .populate('topics', 'name points')
      .populate('department', 'name')
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error('Get Worker Activities Error:', error);
    res.status(500);
    throw new Error('Failed to retrieve worker activities');
  }
});

const resetWorkerActivities = asyncHandler(async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    await Task.deleteMany({ worker: req.params.id });

    worker.totalPoints = 0;
    worker.topicPoints = {};
    worker.lastSubmission = {};
    await worker.save();

    res.json({ message: 'Worker activities reset successfully' });
  } catch (error) {
    console.error('Reset Worker Activities Error:', error);
    res.status(400);
    throw new Error(error.message || 'Failed to reset worker activities');
  }
});

const getWorkersByDepartment = asyncHandler(async (req, res) => {
  try {
    const workers = await Worker.find({ department: req.params.departmentId })
      .select('-password')
      .populate('department', 'name');

    res.json(workers);
  } catch (error) {
    console.error('Get Workers by Department Error:', error);
    res.status(500);
    throw new Error('Failed to retrieve workers by department');
  }
});

const enrollFace = asyncHandler(async (req, res) => {
  // Debug incoming request
  console.log('=== ENROLL FACE DEBUG ===');
  console.log('Request body:', req.body);
  console.log('Files received:', req.file ? 'Yes' : 'No');
  if (req.file) {
    console.log('File details:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });
  }
  
  const { workerId, subdomain } = req.body;
  const image = req.file;

  if (!image) {
    console.error('No image file received in request');
    res.status(400);
    throw new Error('Image file is required');
  }

  const worker = await Worker.findById(workerId);
  if (!worker || worker.subdomain !== subdomain) {
    res.status(404);
    throw new Error('Worker not found or unauthorized');
  }
  
  // Use a temporary path for the image to pass to the Python script
  const imagePath = image.path;
  const savedImageName = `face_${workerId}_${Date.now()}.jpg`;
  const savedImagePath = path.join(__dirname, '../uploads', savedImageName);

  // Call the Python script to get the face encoding
  const pythonProcess = spawn('python3', [path.join(__dirname, '../face_recognition_service.py'), 'encode', imagePath]);
  let output = '';
  let errorOutput = '';

  pythonProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  pythonProcess.on('close', async (code) => {
    if (code !== 0) {
      // Clean up the temporary image file
      try {
        fs.unlinkSync(imagePath);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
      
      console.error(`Python script exited with code ${code}:`, errorOutput);
      
      // Parse error message from Python script
      let errorMessage = 'Failed to process face image';
      try {
        const errorData = JSON.parse(errorOutput);
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (parseError) {
        // Use default error message if parsing fails
      }
      
      return res.status(400).json({ message: errorMessage });
    }

    try {
      // Parse the face encoding from Python script output
      const encoding = JSON.parse(output);
      
      // Validate encoding
      if (!encoding || !Array.isArray(encoding) || encoding.length === 0) {
        throw new Error('Invalid face encoding generated');
      }
      
      // Check for invalid values
      if (hasInvalidValues(encoding)) {
        throw new Error('Invalid values in face encoding');
      }
      
      // Check encoding variance (too low variance might indicate poor quality)
      const variance = calculateVariance(encoding);
      if (variance < 0.005) {  // Increased variance requirement
        throw new Error('Low quality face encoding detected. Please ensure good lighting and try again.');
      }

      // Move the temporary image to permanent storage
      fs.renameSync(imagePath, savedImagePath);
      
      // Create the URL for the saved image
      const imageUrl = `/uploads/${savedImageName}`;
      
      // Initialize facePhotos array if it doesn't exist
      if (!worker.facePhotos) {
        worker.facePhotos = [];
      }
      
      // Add the new face photo to the array
      worker.facePhotos.push(imageUrl);
      
      // Update or set the face encoding (use the latest one)
      worker.faceEncoding = encoding;
      
      await worker.save();

      res.status(200).json({ 
        message: 'Face enrolled successfully',
        facePhotosCount: worker.facePhotos.length,
        facePhotoUrl: imageUrl
      });
    } catch (parseError) {
      // Clean up files in case of error
      try {
        fs.unlinkSync(imagePath);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
      
      console.error('Error processing face encoding:', parseError);
      res.status(500).json({ message: parseError.message || 'Failed to process face encoding' });
    }
  });
});

// Helper function to check for invalid values in an array
function hasInvalidValues(arr) {
  return arr.some(val => !isFinite(val));
}

// Helper function to calculate variance of an array
function calculateVariance(arr) {
  const mean = arr.reduce((sum, value) => sum + value, 0) / arr.length;
  const squaredDifferences = arr.map(value => Math.pow(value - mean, 2));
  const variance = squaredDifferences.reduce((sum, value) => sum + value, 0) / arr.length;
  return variance;
}

module.exports = {
  getWorkers,
  createWorker,
  getWorkerById,
  updateWorker,
  deleteWorker,
  getWorkerActivities,
  resetWorkerActivities,
  getWorkersByDepartment,
  getPublicWorkers,
  generateId,
  enrollFace,
  clearFacePhotos,
  deleteIndividualFacePhoto
};