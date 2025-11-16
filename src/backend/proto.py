from load_index import search_query


query = "I want to swim"
results, topic, distances = search_query(query, k=5)

print(f"Topic classified: {topic}")
for i, r in enumerate(results):
    print(f"{i+1}. {r['title']} ({distances[i]:.3f})")
    print(f"   Summary: {r['summary']}\n")