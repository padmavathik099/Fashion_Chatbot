import pandas as pd
import torch
from torch.utils.data import Dataset
from PIL import Image
import os
from sentence_transformers import SentenceTransformer
from torchvision import transforms
import logging
from typing import List, Dict, Any
from flask import Flask, render_template, request, send_from_directory, url_for


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FastFashionDataset(Dataset):
    """Optimized Fashion Dataset"""
    def __init__(self, styles_csv: str, image_dir: str):
        try:
            self.styles_data = pd.read_csv(
                styles_csv,
                usecols=['id', 'gender', 'articleType', 'baseColour', 'season', 'usage', 'productDisplayName'],
                engine='python',
                on_bad_lines='skip'
            )
        except Exception as e:
            logger.error(f"Error reading CSV: {e}")
            self.styles_data = pd.DataFrame({
                'id': range(10),
                'gender': ['Unisex'] * 10,
                'articleType': ['T-shirt'] * 10,
                'baseColour': ['Black'] * 10,
                'season': ['Summer'] * 10,
                'usage': ['Casual'] * 10,
                'productDisplayName': ['Basic T-shirt'] * 10
            })

        self.image_dir = image_dir
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
        ])

        os.makedirs('embeddings_cache', exist_ok=True)

    def __len__(self) -> int:
        return len(self.styles_data)

    def load_image(self, idx: int) -> Image.Image:
        """Load and process image with error handling"""
        row = self.styles_data.iloc[idx]
        img_path = os.path.join(self.image_dir, f"{row['id']}.jpg")
        
        try:
            with Image.open(img_path) as img:
                return img.convert('RGB')
        except Exception as e:
            logger.warning(f"Error loading image {img_path}: {e}")
            return Image.new('RGB', (224, 224), color='gray')

    def get_description(self, idx: int) -> str:
        """Get item description including productDisplayName"""
        row = self.styles_data.iloc[idx]
        product_name = row['productDisplayName'] if pd.notna(row['productDisplayName']) else f"{row['gender']} {row['articleType']}"
        
        return f"{product_name} in {row['baseColour']} for {row['season']}, {row['usage']}"

class FastFashionRecommender:
    def __init__(self, styles_csv: str, image_dir: str):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = SentenceTransformer('sentence-transformers/clip-ViT-B-32', device=self.device)
        self.dataset = FastFashionDataset(styles_csv, image_dir)
        
        self.cache_file = 'embeddings_cache/image_embeddings.pt'
        self.embeddings = self.load_or_create_embeddings()

    def load_or_create_embeddings(self) -> torch.Tensor:
        """Load cached embeddings or create new ones"""
        if os.path.exists(self.cache_file):
            logger.info("Loading cached embeddings...")
            return torch.load(self.cache_file)
        
        logger.info("Creating new embeddings...")
        embeddings = []
        batch_size = 32
        
        for i in range(0, len(self.dataset), batch_size):
            batch_indices = range(i, min(i + batch_size, len(self.dataset)))
            batch_images = [self.dataset.load_image(idx) for idx in batch_indices]
            batch_embeddings = self.model.encode(batch_images)
            embeddings.extend(batch_embeddings)
            
            if i % 100 == 0:
                logger.info(f"Processed {i}/{len(self.dataset)} images")

        embeddings_tensor = torch.tensor(embeddings)
        torch.save(embeddings_tensor, self.cache_file)
        return embeddings_tensor
   

    def find_similar_items(self, query: str = None, image_path: str = None, top_k: int = 5):
        if query:
            query_embedding = torch.FloatTensor(self.model.encode(query)).unsqueeze(0)
        elif image_path:
            image = Image.open(image_path).convert('RGB')
            image_tensor = self.transform(image).unsqueeze(0).to(self.device)
            query_embedding = torch.FloatTensor(self.model.encode(image_tensor))
        else:
            return []

        similarities = torch.nn.functional.cosine_similarity(query_embedding, self.embeddings)
        top_indices = similarities.argsort(descending=True)[:top_k].tolist()

        results = []
        for idx in top_indices:
            idx = int(idx)
            image_filename = f"{self.dataset.styles_data.iloc[idx]['id']}.jpg"
            image_url = url_for('serve_image', filename=image_filename, _external=True)
            description = self.dataset.get_description(idx)
            score = similarities[idx].item()

            results.append({
                'image_url': image_url,
                'description': description,
                'score': score
            })

        return results
