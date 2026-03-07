import json
import os
from collections import Counter


DATA_PATH = '/home/ubuubuntu/Documents/Marthan/pathfinder/src/backend/dataset/dataset.json'


def check_pathfinder_entities():
    if not os.path.exists(DATA_PATH):
        print(f"Error: {DATA_PATH} not found. Check your filename.")
        return

    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)


    topics = [item.get('topic', 'missing_topic').lower() for item in data]
    topic_counts = Counter(topics)


    all_activities = []
    for item in data:
        all_activities.extend(item.get('activities', []))
    activity_counts = Counter(all_activities)

    print(f"--- PATHFINDER DATA AUDIT ---")
    print(f"Total entries: {len(data)}")
    print("\n[TOPIC DISTRIBUTION]")
    for t, count in topic_counts.items():
        print(f"- {t:<15}: {count}")

    print("\n[ACTIVITY LABELS FOUND]")
    for a, count in activity_counts.items():
        print(f"- {a:<15}: {count}")

if __name__ == "__main__":
    check_pathfinder_entities()