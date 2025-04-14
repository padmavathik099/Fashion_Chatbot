import os
import cv2
import numpy as np
import requests
from requests_toolbelt.multipart.encoder import MultipartEncoder
from urllib.parse import urlparse
import logging
import json
from io import BytesIO
from dataclasses import dataclass
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, send_file, make_response
from PIL import Image
import tempfile
from flask_cors import CORS
from flask import Flask, request, send_file

# Configure logging
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app)

@dataclass
class TryOnDiffusionAPIResponse:
    status_code: int
    image: np.ndarray = None
    response_data: bytes = None
    error_details: str = None
    seed: int = None


class TryOnDiffusionClient:
    def __init__(self, base_url: str = "https://try-on-diffusion.p.rapidapi.com", api_key: str = "84b5e1111dmsh24f6d481d6d7f90p10dee1jsn1647ff2409c5"):
        self._logger = logging.getLogger("try_on_diffusion_client")
        self._base_url = base_url
        self._api_key = api_key

        if self._base_url[-1] == "/":
            self._base_url = self._base_url[:-1]

        parsed_url = urlparse(self._base_url)
        self._rapidapi_host = parsed_url.netloc if parsed_url.netloc.endswith(".rapidapi.com") else None

        if self._rapidapi_host is not None:
            self._logger.info(f"Using RapidAPI proxy: {self._rapidapi_host}")

    @staticmethod
    def _image_to_upload_file(image: np.ndarray) -> tuple:
        _, jpeg_data = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 99])
        jpeg_data = jpeg_data.tobytes()
        fp = BytesIO(jpeg_data)
        return "image.jpg", fp, "image/jpeg"

    def try_on_file(
        self,
        clothing_image: np.ndarray = None,
        clothing_prompt: str = None,
        avatar_image: np.ndarray = None,
        avatar_prompt: str = None,
        avatar_sex: str = None,
        background_image: np.ndarray = None,
        background_prompt: str = None,
        seed: int = -1,
        raw_response: bool = False,
    ) -> TryOnDiffusionAPIResponse:
        url = self._base_url + "/try-on-file"
        request_data = {"seed": str(seed)}

        if clothing_image is not None:
            request_data["clothing_image"] = self._image_to_upload_file(clothing_image)

        if clothing_prompt is not None:
            request_data["clothing_prompt"] = clothing_prompt

        if avatar_image is not None:
            request_data["avatar_image"] = self._image_to_upload_file(avatar_image)

        if avatar_prompt is not None:
            request_data["avatar_prompt"] = avatar_prompt

        if avatar_sex is not None:
            request_data["avatar_sex"] = avatar_sex

        if background_image is not None:
            request_data["background_image"] = self._image_to_upload_file(background_image)

        if background_prompt is not None:
            request_data["background_prompt"] = background_prompt

        multipart_data = MultipartEncoder(fields=request_data)
        headers = {"Content-Type": multipart_data.content_type}

        if self._rapidapi_host is not None:
            headers["X-RapidAPI-Key"] = self._api_key
            headers["X-RapidAPI-Host"] = self._rapidapi_host
        else:
            headers["X-API-Key"] = self._api_key

        try:
            response = requests.post(url, data=multipart_data, headers=headers)
        except Exception as e:
            self._logger.error(e, exc_info=True)
            return TryOnDiffusionAPIResponse(status_code=0)

        result = TryOnDiffusionAPIResponse(status_code=response.status_code)

        if not raw_response and response.status_code == 200:
            try:
                result.image = cv2.imdecode(np.frombuffer(response.content, np.uint8), cv2.IMREAD_COLOR)
            except:
                result.image = None
        else:
            result.response_data = response.content

        if result.status_code == 200:
            if "X-Seed" in response.headers:
                result.seed = int(response.headers["X-Seed"])
        else:
            try:
                response_json = json.loads(result.response_data.decode("utf-8")) if result.response_data is not None else None
                if response_json is not None and "detail" in response_json:
                    result.error_details = response_json["detail"]
            except:
                result.error_details = None

        return result


# Helper functions
def pil_to_cv2(pil_image):
    """Convert PIL Image to OpenCV format (numpy array)"""
    return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

def cv2_to_pil(cv2_image):
    """Convert OpenCV image to PIL format"""
    if cv2_image is None:
        return None
    return Image.fromarray(cv2.cvtColor(cv2_image, cv2.COLOR_BGR2RGB))

# Create Flask app
app.secret_key = "your_secret_key_here"
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

# Create necessary directories
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/try-on', methods=['POST', 'OPTIONS'])
def try_on():
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type, Authorization")
    response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")

    if request.method == "OPTIONS":  # Handle preflight request
        return response, 200  

    # Check if both images are uploaded
    if 'avatar_image' not in request.files or 'clothing_image' not in request.files:
        return jsonify({'error': 'Both avatar_image and clothing_image are required'}), 400
    
    avatar_file = request.files['avatar_image']
    clothing_file = request.files['clothing_image']
    
    # Check if files are selected
    if avatar_file.filename == '' or clothing_file.filename == '':
        return jsonify({'error': 'Please select both files'}), 400

    try:
        # Read and convert images
        avatar_img = Image.open(avatar_file)
        clothing_img = Image.open(clothing_file)
        
        # Convert PIL images to CV2 format
        avatar_cv2 = pil_to_cv2(avatar_img)
        clothing_cv2 = pil_to_cv2(clothing_img)
        
        # Get additional parameters with defaults
        avatar_sex = request.form.get('avatar_sex', 'None')
        clothing_prompt = request.form.get('clothing_prompt', '')
        avatar_prompt = request.form.get('avatar_prompt', '')
        background_prompt = request.form.get('background_prompt', '')
        seed = request.form.get('seed', '-1')
        
        try:
            seed_value = int(seed) if seed and seed.strip() else -1
        except ValueError:
            seed_value = -1
        
        client = TryOnDiffusionClient()
        response_data = client.try_on_file(
            clothing_image=clothing_cv2,
            clothing_prompt=clothing_prompt if clothing_prompt.strip() else None,
            avatar_image=avatar_cv2,
            avatar_prompt=avatar_prompt if avatar_prompt.strip() else None,
            avatar_sex=avatar_sex if avatar_sex != "None" else None,
            background_prompt=background_prompt if background_prompt.strip() else None,
            seed=seed_value
        )
        
        if response_data.status_code != 200 or response_data.image is None:
            return jsonify({'error': 'Could not process the try-on request'}), 500
        
        # Convert the result image to bytes
        result_img = cv2_to_pil(response_data.image)
        img_byte_arr = BytesIO()
        result_img.save(img_byte_arr, format='JPEG')
        img_byte_arr = img_byte_arr.getvalue()

        # Return the image as a binary response
        return send_file(
            BytesIO(img_byte_arr),
            mimetype='image/jpeg',
            as_attachment=False
        )

    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(debug=True, host='0.0.0.0', port=port)
