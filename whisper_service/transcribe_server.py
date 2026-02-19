import os
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel

app = Flask(__name__)
CORS(app)

# Load model (tiny, base, small, medium, large-v3, large-v3-turbo)
# "large-v3-turbo" is the fastest high-accuracy model
model_size = "large-v3-turbo"
print(f"Loading Whisper model '{model_size}'...")
import traceback
try:
    # Use "cpu" for maximum compatibility. Python 3.14 might have auto-detect issues.
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    print("Model loaded successfully.")
except Exception as e:
    print("FATAL ERROR during model initialization:")
    traceback.print_exc()
    # Fallback to small if medium fails? No, let's see why it fails first.
    raise e

# Check ffmpeg availability on startup
import subprocess
try:
    subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
    print("ffmpeg found and working.")
except Exception as e:
    print("CRITICAL ERROR: ffmpeg not found or not working. Please install ffmpeg and add it to PATH.")
    print(f"Error details: {e}")

@app.route('/transcribe', methods=['POST'])
def transcribe():
    print("--- New Transcription Request ---")
    if 'file' not in request.files:
        print("Error: No file in request.files")
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    print(f"Received file: {file.filename}")
    if file.filename == '':
        print("Error: Empty filename")
        return jsonify({"error": "No file selected"}), 400

    # Save to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
        temp_path = temp_file.name
        file.save(temp_path)

    audio_path = temp_path + ".wav"

    try:
        # Convert video/webm to audio only using ffmpeg
        print(f"Extracting audio from {temp_path} to {audio_path}...")
        conversion = subprocess.run([
            'ffmpeg', '-y', '-i', temp_path, 
            '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', 
            audio_path
        ], capture_output=True, text=True)

        if conversion.returncode != 0:
            print(f"FFmpeg error: {conversion.stderr}")
            return jsonify({"error": f"FFmpeg failed: {conversion.stderr}"}), 500

        print(f"Transcribing audio {audio_path}...")
        # Add VAD filter to ignore silence and condition_on_previous_text=False to prevent "dots" repetition loops
        # initial_prompt helps with accuracy by providing context
        segments, info = model.transcribe(
            audio_path, 
            beam_size=5, 
            vad_filter=True, 
            condition_on_previous_text=False,
            # Accuracy optimizations for large-v3-turbo
            language="en",
            no_speech_threshold=0.1,    # More sensitive to speech
            log_prob_threshold=-1.0,     # High confidence required
            compression_ratio_threshold=2.4, # Prevent repetitive hallucinations
            initial_prompt="Vtalk meeting recording. Video call transcription."
        )
        
        full_text = []
        for segment in segments:
            full_text.append(segment.text)
        
        result = " ".join(full_text).strip()
        
        # Guard: If result is just a series of dots or common filler hallucinations
        if not result or result.replace(".", "").strip() == "" or len(result) < 2:
            print("Transcription result seems to be noise/silence. Returning 'No speech detected'.")
            result = " (No clear speech detected in this recording) "

        print(f"Transcription complete: {result[:50]}...")
        
        return jsonify({"text": result})

    except Exception as e:
        print(f"Error during transcription: {str(e)}")
        return jsonify({"error": f"Server Error: {str(e)}"}), 500
    
    finally:
        # cleanup
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            if os.path.exists(audio_path):
                os.remove(audio_path)
        except Exception:
            pass

if __name__ == '__main__':
    # Listen on port 5001 to avoid conflict with backend on 5000
    app.run(port=5001, debug=False)
