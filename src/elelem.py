from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM

model_name = "gpt2"

# Load tokenizer (this turns words into tokens the model understands)
tokenizer = AutoTokenizer.from_pretrained(model_name)

# Load the actual GPT-2 model
model = AutoModelForCausalLM.from_pretrained(model_name)

generate = pipeline("text-generation", model=model, tokenizer=tokenizer)

result = generate("Once upon a time,", max_length=50, num_return_sequences=1)

print(result[0]["generated_text"])
