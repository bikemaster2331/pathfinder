# Quick script to check topics
import json

with open("src/backend/dataset/dataset.json", "r") as f:
    data = json.load(f)

topic_counts = {}
for item in data:
    topic = item.get('topic', 'Unknown')
    topic_counts[topic] = topic_counts.get(topic, 0) + 1

print("Topics in dataset:")
for topic, count in sorted(topic_counts.items()):
    print(f"  {topic}: {count} entries")
