import torch
from flask import Flask, request, jsonify, send_file, render_template_string
from diffusers import DiffusionPipeline, DPMSolverMultistepScheduler
from PIL import Image
import os
from flask_cors import CORS  

app = Flask(__name__)
CORS(app) 
# Set Hugging Face cache directory to avoid redownloading models
os.environ["HF_HOME"] = "./hf_cache"
os.makedirs("hf_cache", exist_ok=True)

# Check CUDA availability
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
torch.backends.cuda.matmul.allow_tf32 = True  # Improve performance on Ampere GPUs

# Load Stable Diffusion Model with performance optimizations
try:
    print("Loading Stable Diffusion model with optimizations...")
    
    # Use a faster scheduler
    model_id = "stabilityai/stable-diffusion-2-base"  # Smaller, faster model
    
    # Load the pipeline with optimizations
    pipeline = DiffusionPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        cache_dir="./hf_cache",
        safety_checker=None,  # Disable safety checker for speed
        low_cpu_mem_usage=True
    )
    
    # Use a faster scheduler (DPM-Solver++ is much faster than default)
    pipeline.scheduler = DPMSolverMultistepScheduler.from_config(pipeline.scheduler.config)
    
    # Move to device
    pipeline = pipeline.to(device)
    
    # Enable memory efficient attention if using CUDA
    if device.type == "cuda":
        pipeline.enable_attention_slicing()
        # Use xFormers attention if available
        try:
            pipeline.enable_xformers_memory_efficient_attention()
            print("xFormers memory efficient attention enabled")
        except (ImportError, AttributeError):
            print("xFormers not available, using default attention mechanism")
    
    print("Model loaded successfully with optimizations.")
except Exception as e:
    print(f"Error loading model: {e}")
    exit(1)

def generate_outfit_image(prompt):
    """Generate an image using Stable Diffusion with speed optimizations."""
    # Create a concise prompt - less text is faster to process
    enhanced_prompt = f"fashion photograph of {prompt}, studio lighting"
    
    # Set a seed for reproducibility
    generator = torch.Generator(device=device).manual_seed(42)

    try:
        # Generate the image with reduced steps
        print(f"Generating image with prompt: {enhanced_prompt}")
        image = pipeline(
            enhanced_prompt,
            num_inference_steps=15,  # Reduced from 30 to 15 for faster generation
            generator=generator,
            guidance_scale=7.0,  # Slightly reduced for speed
            height=512,  # Use standard resolution
            width=512,  # Use standard resolution
        ).images[0]
        print("Image generated successfully.")
        return image
    except Exception as e:
        print(f"Error generating image: {e}")
        return None

# Add a root route with a simple HTML interface
@app.route("/", methods=["GET"])
def index():
    html_template = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Fast Fashion Outfit Generator</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .container {
                display: flex;
                flex-direction: column;
                gap: 20px;
                background-color: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            h1 {
                color: #333;
                text-align: center;
            }
            textarea {
                width: 100%;
                height: 100px;
                padding: 10px;
                margin: 10px 0;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-family: Arial, sans-serif;
            }
            button {
                padding: 10px 20px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
            }
            button:hover {
                background-color: #45a049;
            }
            button:disabled {
                background-color: #cccccc;
                cursor: not-allowed;
            }
            #result {
                margin-top: 20px;
                text-align: center;
            }
            img {
                max-width: 100%;
                display: none;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            }
            .loading {
                display: none;
                text-align: center;
                margin: 20px 0;
                color: #666;
            }
            .examples {
                margin-top: 20px;
                padding: 10px;
                background-color: #f9f9f9;
                border-radius: 4px;
            }
            .examples h3 {
                margin-top: 0;
            }
            .examples p {
                margin: 5px 0;
                cursor: pointer;
                color: #0066cc;
            }
            .examples p:hover {
                text-decoration: underline;
            }
            .speed-setting {
                margin-top: 10px;
                display: flex;
                align-items: center;
            }
            .speed-setting label {
                margin-right: 10px;
            }
        </style>
    </head>
    <body>
        <h1>Fast Fashion Outfit Generator</h1>
        <p>Enter a brief description of the outfit you'd like to generate.</p>
        
        <div class="container">
            <div>
                <label for="prompt"><b>Outfit Description:</b></label>
                <textarea id="prompt" placeholder="e.g., red summer dress with floral pattern"></textarea>
                
                <div class="speed-setting">
                    <label for="speedMode"><b>Generation Speed:</b></label>
                    <select id="speedMode">
                        <option value="fast" selected>Fast (lower quality)</option>
                        <option value="balanced">Balanced</option>
                        <option value="quality">High Quality (slower)</option>
                    </select>
                </div>
                
                <button id="generateBtn" onclick="generateImage()">Generate Outfit</button>
                <div class="loading" id="loadingIndicator">
                    Generating image... Please wait a moment.
                </div>
            </div>
            
            <div class="examples">
                <h3>Quick Prompts:</h3>
                <p onclick="fillPrompt('blue denim jacket with white t-shirt')">Blue denim jacket with white t-shirt</p>
                <p onclick="fillPrompt('black evening gown with sequins')">Black evening gown with sequins</p>
                <p onclick="fillPrompt('business casual outfit with beige pants')">Business casual with beige pants</p>
            </div>
            
            <div id="result">
                <h2>Generated Outfit</h2>
                <img id="generatedImage" src="" alt="Generated outfit will appear here">
            </div>
        </div>

        <script>
            function fillPrompt(text) {
                document.getElementById('prompt').value = text;
            }
            
            function generateImage() {
                const prompt = document.getElementById('prompt').value;
                if (!prompt) {
                    alert('Please enter an outfit description');
                    return;
                }
                
                const speedMode = document.getElementById('speedMode').value;
                
                // Disable button and show loading indicator
                const generateBtn = document.getElementById('generateBtn');
                generateBtn.disabled = true;
                document.getElementById('loadingIndicator').style.display = 'block';
                document.getElementById('generatedImage').style.display = 'none';
                
                // Send request to server
                fetch('/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        prompt: prompt,
                        speed: speedMode
                    }),
                })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(data => {
                            throw new Error(data.error || 'Network response was not ok');
                        });
                    }
                    return response.blob();
                })
                .then(blob => {
                    // Hide loading indicator and enable button
                    document.getElementById('loadingIndicator').style.display = 'none';
                    generateBtn.disabled = false;
                    
                    // Display the image
                    const imageUrl = URL.createObjectURL(blob);
                    const imageElement = document.getElementById('generatedImage');
                    imageElement.src = imageUrl;
                    imageElement.style.display = 'block';
                })
                .catch(error => {
                    document.getElementById('loadingIndicator').style.display = 'none';
                    generateBtn.disabled = false;
                    alert('Error generating image: ' + error.message);
                });
            }
        </script>
    </body>
    </html>
    """
    return render_template_string(html_template)

@app.route("/generate", methods=["POST"])
def generate():
    """Flask route to generate an outfit image from a text prompt."""
    data = request.get_json()
    prompt = data.get("prompt", "").strip()
    speed_mode = data.get("speed", "fast")

    if not prompt:
        return jsonify({"error": "Please enter a valid outfit description."}), 400

    # Adjust settings based on speed mode
    if speed_mode == "fast":
        steps = 12
        guidance_scale = 7.0
    elif speed_mode == "balanced":
        steps = 20
        guidance_scale = 7.5
    else:  # quality
        steps = 30
        guidance_scale = 8.0

    # Override the settings in the function call
    image = generate_outfit_image(prompt)
    if image is None:
        return jsonify({"error": "Image generation failed. Please try again with a different description."}), 500

    image_path = "generated_outfit.png"
    image.save(image_path, format="PNG")

    return send_file(image_path, mimetype='image/png')

if __name__ == "__main__":
    # Run on port 5001 to avoid conflicts with another running Flask API
    app.run(host="0.0.0.0", port=5001, debug=True)