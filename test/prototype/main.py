# src/main.py
from transformers import pipeline

# Load your trained model
print("Loading chatbot...")
chatbot = pipeline("text-generation", model="./my_chatbot", device=0)  # device=0 uses GPU

print("Chatbot ready! Type 'exit' to quit.\n")

while True:
    question = input("You: ")
    if question.lower() in ['exit', 'quit', 'bye']:
        print("Goodbye!")
        break
    
    # Format as training data format
    prompt = f"Q: {question} A:"
    
    # Generate response - FIX: Use only max_new_tokens OR max_length, not both
    response = chatbot(
        prompt, 
        max_new_tokens=50,          # Generate up to 50 new tokens
        num_return_sequences=1,
        truncation=True,            # Fix truncation warning
        pad_token_id=chatbot.tokenizer.eos_token_id,  # Avoid warnings
        do_sample=True,             # More natural responses
        temperature=0.7             # Randomness (0.1=focused, 1.0=creative)
    )
    
    # Extract just the answer part
    full_response = response[0]["generated_text"]
    answer = full_response.replace(prompt, "").strip()
    
    # Clean up if it generates multiple Q&As
    if "Q:" in answer:
        answer = answer.split("Q:")[0].strip()
    
    print(f"Bot: {answer}\n")