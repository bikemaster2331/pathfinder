from sentence_transformers import SentenceTransformer
import os

# 1. Define the exact model name from Hugging Face
model_name = 'paraphrase-multilingual-MiniLM-L12-v2'

# 2. Define the local path where you want to save it
# This will create a 'models' folder in your project root
save_path = './models/paraphrase-multilingual-MiniLM-L12-v2'

print(f"⬇️  Downloading {model_name}...")
# This downloads the model from the internet
model = SentenceTransformer(model_name)

print(f"💾 Saving model to {save_path}...")
# This saves the model files to your local folder
model.save(save_path)

print("✅ Done! Model is ready for offline use.")