import random
import json
import os
from datetime import datetime
from pathlib import Path

# IMPORTANT: You must import the Pipeline class from your core logic
# Ensure this path is correct based on how your modules are structured:
from pipeline import Pipeline 

# --- Constants for Imperfect Query Generation ---
MUNICIPALITIES = [
    "VIRAC", "BARAS", "BATO", "CARAMORAN", "GIGMOTO", 
    "PANDAN", "PANGANIBAN", "SAN ANDRES", "VIGA"
]
TOPICS = [
    "history", "food", "best beach", "waterfall", "how to get to", "weather", "local custom"
]
TYPOS = {
    "beach": "beecha", "history": "hsitory", "Virac": "Vrak", "get": "gret"
}

# --- Generation and Noise Logic ---

def _introduce_noise(text: str) -> str:
    """Randomly introduces a typo or misspelling into the text for realistic testing."""
    words = text.split()
    if not words or random.random() < 0.5:
        return text
    
    word_to_modify = random.choice(words)
    
    if word_to_modify in TYPOS:
        words[words.index(word_to_modify)] = TYPOS[word_to_modify]
    elif len(word_to_modify) > 3 and random.random() < 0.3:
        # Simple transposition typo
        idx = random.randint(1, len(word_to_modify) - 2)
        word_list = list(word_to_modify)
        word_list[idx], word_list[idx+1] = word_list[idx+1], word_list[idx]
        words[words.index(word_to_modify)] = "".join(word_list)
        
    return " ".join(words)

def generate_imperfect_question() -> str:
    """Creates a single, template-based, imperfect question."""
    TEMPLATES = [
        "What is the {topic} of {muni}?",
        "How do I {topic} in {muni}?",
        "Is there a {topic} near {muni}?",
        "Tell me about {muni} and its {topic}.",
        "I want to go to {muni}. What is the {topic}?"
    ]
    
    template = random.choice(TEMPLATES)
    muni = random.choice(MUNICIPALITIES)
    topic = random.choice(TOPICS)
    
    question = template.format(muni=muni, topic=topic)
    return _introduce_noise(question)

# --- The Main Worker Function ---

def run_evolution_cycle(num_questions: int = 10):
    """Initializes the pipeline and feeds it generated queries for learning."""
    
    # 1. Initialize the Pipeline (Accesses database/AI model)
    try:
        # Note: This creates a NEW instance of your working pipeline
        pipeline = Pipeline() 
    except Exception as e:
        print(f"ERROR: Could not initialize core Pipeline: {e}")
        return

    BASE_DIR = pipeline.BASE_DIR # Get base directory from the pipeline instance
    log_file = os.path.join(BASE_DIR, "autotest_worker_log.jsonl")
    log_entries = []

    print(f"Starting evolution cycle for {num_questions} questions...")

    for i in range(num_questions):
        question = generate_imperfect_question()
        print(f"[{i+1}/{num_questions}] Running test: {question}")

        # 2. Execute the test using the pipeline's public method
        try:
            # The core logic runs here, testing the system's current state
            result = pipeline.ask(question)

            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "question": question,
                "answer": result.answer,
                "status": "Success",
                # The pipeline's successful response is implicitly used here 
                # to enhance the semantic cache or entity database.
            }
            log_entries.append(log_entry)

        except Exception as e:
            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "question": question,
                "status": "Worker Error",
                "error_detail": str(e)
            }
            log_entries.append(log_entry)

    # 3. Log the results
    with open(log_file, "a") as f:
        for entry in log_entries:
            f.write(json.dumps(entry) + "\n")
    
    print(f"Evolution cycle complete. {len(log_entries)} results logged.")


if __name__ == "__main__":
    # You can pass the number of questions here, or use a default
    run_evolution_cycle(num_questions=10) # Run a manageable batch