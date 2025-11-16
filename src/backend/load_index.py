# search_module.py

from classifier import classify_topic
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
import sqlite3
import os

# --- CONFIG ---
INDICE_DIR = "pi_indices"
MODEL_NAME = 'all-MiniLM-L6-v2'
DB_PATH = os.path.join(INDICE_DIR, "metadata.db")

# Load model once
model = SentenceTransformer(MODEL_NAME)


def load_index(topic, chunk=0):
    """Load FAISS index for a given topic and chunk number."""
    index_path = os.path.join(INDICE_DIR, f"{topic}_chunk_{chunk}.index")
    if not os.path.exists(index_path):
        raise FileNotFoundError(f"FAISS index not found: {index_path}")
    return faiss.read_index(index_path)


def fetch_metadata(doc_id):
    """Fetch metadata for a document ID from SQLite."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    res = cursor.execute(
        "SELECT title, summary_offline FROM documents WHERE document_id = ?",
        (doc_id,)
    ).fetchone()
    conn.close()
    return res  # tuple: (title, summary_offline) or None


def search_query(user_query, k=5):
    """
    Full pipeline:
    1. Classify topic
    2. Embed query
    3. Load FAISS index for that topic
    4. Search top-k nearest neighbors
    5. Fetch metadata for each result
    """
    # 1. Classify topic
    topic = classify_topic(user_query)

    # 2. Embed query
    query_vec = model.encode(user_query).astype('float32')
    query_vec = np.expand_dims(query_vec, 0)  # FAISS expects 2D array

    # 3. Load FAISS index
    index = load_index(topic)

    # 4. Search
    distances, indices = index.search(query_vec, k)

    # 5. Fetch metadata
    results = []
    for doc_id in indices[0]:
        # doc_id in FAISS might be int; convert to string with topic prefix if needed
        if isinstance(doc_id, np.integer) or isinstance(doc_id, int):
            doc_id = f"{topic}_{doc_id}"
        meta = fetch_metadata(doc_id)
        if meta:
            results.append({"doc_id": doc_id, "title": meta[0], "summary": meta[1]})
    return results, topic, distances[0]
