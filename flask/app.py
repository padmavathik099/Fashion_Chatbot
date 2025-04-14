import logging
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from fast_fashion_recommender import FastFashionRecommender
from flask import Flask, render_template, request, send_from_directory, url_for
from fast_fashion_recommender import FastFashionRecommender
import os


app = Flask(__name__)
CORS(app)  # Allow frontend to access the API

# Enable logging
logging.basicConfig(level=logging.INFO)

# Initialize the recommender system
STYLES_CSV = "myntradataset/styles.csv"
IMAGE_DIR = "myntradataset/images"
recommender = FastFashionRecommender(STYLES_CSV, IMAGE_DIR)

@app.route("/", methods=["GET"])
def home():
    return render_template('index.html')

@app.route("/recommend", methods=["POST"])
def recommend():
    try:
        data = request.get_json() or request.form
        if not data or "query" not in data:
            return jsonify({"error": "Query is required"}), 400

        query = data["query"]
        logging.info(f"Received query: {query}")

        recommendations = recommender.find_similar_items(query=query)
        logging.info(f"Returning recommendations: {recommendations}")

        return jsonify(recommendations)

    except Exception as e:
        logging.error(f"Error processing request: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(IMAGE_DIR, filename)


if __name__ == "__main__":
    app.run(debug=True)
