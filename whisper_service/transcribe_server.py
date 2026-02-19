import os
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel

app = Flask(__name__)
CORS(app)

# Load model (tiny, base, small, medium, large)
# "base" is a good balance for speed and accuracy
model_size = "base"
print(f"Loading Whisper model '{model_size}'...")
model = WhisperModel(model_size, device="cpu", compute_type="int8")
print("Model loaded successfully.")

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    # Save to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
        temp_path = temp_file.name
        file.save(temp_path)

    try:
        print(f"Transcribing {temp_path}...")
        segments, info = model.transcribe(temp_path, beam_size=5)
        
        full_text = []
        for segment in segments:
            full_text.append(segment.text)
        
        result = " ".join(full_text).strip()
        print(f"Transcription complete: {result[:50]}...")
        
        return jsonify({"text": result})

    except Exception as e:
        print(f"Error during transcription: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == '__main__':
    # Listen on port 5001 to avoid conflict with backend on 5000
    app.run(port=5001, debug=False)
