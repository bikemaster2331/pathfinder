# train_chatbot.py
import json
from transformers import GPT2Tokenizer, GPT2LMHeadModel, Trainer, TrainingArguments, DataCollatorForLanguageModeling
from datasets import Dataset


with open("dataset/dataset.json", "r") as f:
    data = json.load(f)

# 2. Format data for training (Q&A format)
train_data = []
for item in data:
    text = f"Q: {item['input']} A: {item['output']}"
    train_data.append({"text": text})

# Convert to Dataset
dataset = Dataset.from_list(train_data)

# 3. Load GPT-2 model and tokenizer
model_name = "gpt2"
tokenizer = GPT2Tokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token  # GPT-2 needs this
model = GPT2LMHeadModel.from_pretrained(model_name)

# 4. Tokenize the data - FIX: Add labels
def tokenize_function(examples):
    tokenized = tokenizer(
        examples["text"], 
        truncation=True, 
        padding="max_length", 
        max_length=128
    )
    # IMPORTANT: Copy input_ids to labels for language modeling
    tokenized["labels"] = tokenized["input_ids"].copy()
    return tokenized
    
tokenized_dataset = dataset.map(tokenize_function, batched=True)

# 5. Data collator (handles padding during training)
data_collator = DataCollatorForLanguageModeling(
    tokenizer=tokenizer,
    mlm=False  # We're doing causal language modeling, not masked
)

# 6. Training configuration
training_args = TrainingArguments(
    output_dir="./chatbot_model",
    num_train_epochs=10,
    per_device_train_batch_size=2,
    save_steps=50,
    save_total_limit=2,
    logging_steps=10,
    learning_rate=5e-5,
)

# 7. Create trainer and train
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset,
    data_collator=data_collator,  # ADD THIS
)

print("Starting training...")
trainer.train()

# 8. Save the trained model
model.save_pretrained("./my_chatbot")
tokenizer.save_pretrained("./my_chatbot")
print("Training complete! Model saved to ./my_chatbot")