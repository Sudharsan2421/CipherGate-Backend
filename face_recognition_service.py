import face_recognition
import numpy as np
import sys
import cv2
import json
from PIL import Image, ImageEnhance

def preprocess_image(image_path):
    """Preprocess image to improve face detection quality"""
    try:
        # Load image with OpenCV for preprocessing
        img = cv2.imread(image_path)
        if img is None:
            return None
            
        # Convert to RGB (face_recognition expects RGB)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Enhance image quality
        pil_img = Image.fromarray(img_rgb)
        
        # Enhance contrast and brightness
        enhancer = ImageEnhance.Contrast(pil_img)
        img_enhanced = enhancer.enhance(1.2)
        
        enhancer = ImageEnhance.Brightness(img_enhanced)
        img_enhanced = enhancer.enhance(1.1)
        
        # Convert back to numpy array
        return np.array(img_enhanced)
    except Exception as e:
        print(f"Error preprocessing image: {e}", file=sys.stderr)
        return None

def validate_face_quality(face_location, image_shape):
    """Validate if the detected face has good quality for recognition"""
    top, right, bottom, left = face_location
    
    # Calculate face size
    face_width = right - left
    face_height = bottom - top
    face_area = face_width * face_height
    
    # Check minimum face size (at least 100x100 pixels for stricter validation)
    if face_width < 100 or face_height < 100:
        return False, "Face too small for reliable recognition"
    
    # Check if face is too close to edges
    margin = 20
    if (left < margin or top < margin or 
        right > image_shape[1] - margin or bottom > image_shape[0] - margin):
        return False, "Face too close to image edge"
    
    # Check aspect ratio (face should be roughly rectangular)
    aspect_ratio = face_width / face_height
    if aspect_ratio < 0.7 or aspect_ratio > 1.3:
        return False, "Unusual face aspect ratio"
    
    return True, "Face quality good"

def encode_face(image_path):
    """Extract face encoding from image with quality validation"""
    try:
        # First try with preprocessing
        processed_image = preprocess_image(image_path)
        if processed_image is None:
            # Fallback to direct loading
            processed_image = face_recognition.load_image_file(image_path)
        
        # Detect faces with more strict model
        face_locations = face_recognition.face_locations(processed_image, model="cnn")
        
        if len(face_locations) == 0:
            print(json.dumps({"error": "No face detected in image. Please ensure your face is clearly visible"}), file=sys.stderr)
            return None
        
        if len(face_locations) > 1:
            print(json.dumps({"error": "Multiple faces detected. Please ensure only one person is in the image"}), file=sys.stderr)
            return None
        
        # Validate face quality
        face_location = face_locations[0]
        is_valid, quality_message = validate_face_quality(face_location, processed_image.shape)
        
        if not is_valid:
            print(json.dumps({"error": quality_message}), file=sys.stderr)
            return None
        
        # Generate face encoding with larger model for better accuracy
        face_encodings = face_recognition.face_encodings(processed_image, face_locations, model="large", num_jitters=5)
        
        if len(face_encodings) > 0:
            encoding = face_encodings[0].tolist()
            
            # Validate encoding quality (check for unusual values)
            encoding_array = np.array(encoding)
            if np.any(np.isnan(encoding_array)) or np.any(np.isinf(encoding_array)):
                print(json.dumps({"error": "Invalid face encoding generated"}), file=sys.stderr)
                return None
            
            # Check encoding variance (too low variance might indicate poor quality)
            if np.var(encoding_array) < 0.005:  # Increased variance requirement
                print(json.dumps({"error": "Low quality face encoding. Please try again with better lighting and positioning"}), file=sys.stderr)
                return None
                
            return encoding
        
        print(json.dumps({"error": "Failed to generate face encoding. Please try again"}), file=sys.stderr)
        return None
        
    except Exception as e:
        print(json.dumps({"error": f"Error encoding face: {str(e)}"}), file=sys.stderr)
        return None

def compare_faces_with_distance(known_encodings, unknown_encoding, tolerance=0.3):
    """Compare faces with distance calculation for better accuracy"""
    try:
        if not known_encodings or not unknown_encoding:
            return -1, 1.0
        
        # Convert to numpy arrays
        known_encodings_array = [np.array(enc) for enc in known_encodings]
        unknown_encoding_array = np.array(unknown_encoding)
        
        # Calculate face distances
        distances = face_recognition.face_distance(known_encodings_array, unknown_encoding_array)
        
        # Find the best match
        best_match_index = np.argmin(distances)
        best_distance = distances[best_match_index]
        
        # Check if it's within tolerance (stricter tolerance)
        if best_distance <= tolerance:
            return best_match_index, best_distance
        
        return -1, best_distance
        
    except Exception as e:
        print(json.dumps({"error": f"Error comparing faces: {str(e)}"}), file=sys.stderr)
        return -1, 1.0

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing action parameter"}), file=sys.stderr)
        sys.exit(1)
        
    action = sys.argv[1]
    
    if action == "encode":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Missing image path parameter"}), file=sys.stderr)
            sys.exit(1)
            
        image_path = sys.argv[2]
        encoding = encode_face(image_path)
        
        if encoding:
            # Output as JSON for better parsing
            print(json.dumps(encoding))
        else:
            sys.exit(1)
            
    elif action == "compare":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "Missing parameters for comparison"}), file=sys.stderr)
            sys.exit(1)
            
        # For direct comparison (not using pickle files)
        try:
            known_encodings_str = sys.argv[2]
            unknown_encoding_str = sys.argv[3]
            tolerance = float(sys.argv[4]) if len(sys.argv) > 4 else 0.3
            
            known_encodings = json.loads(known_encodings_str)
            unknown_encoding = json.loads(unknown_encoding_str)
            
            match_index, distance = compare_faces_with_distance(known_encodings, unknown_encoding, tolerance)
            
            result = {
                "match_index": match_index,
                "distance": distance,
                "is_match": match_index >= 0
            }
            
            print(json.dumps(result))
            
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"Invalid JSON input: {str(e)}"}), file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"error": f"Comparison error: {str(e)}"}), file=sys.stderr)
            sys.exit(1)
    else:
        print(json.dumps({"error": f"Unknown action: {action}"}), file=sys.stderr)
        sys.exit(1)