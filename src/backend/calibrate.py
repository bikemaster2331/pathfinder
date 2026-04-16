"""
calibrate.py — RAG Confidence Threshold Calibration Tool
=========================================================
Runs test queries directly against your ChromaDB collection,
records scores, and generates a threshold recommendation report.

Usage:
    python calibrate.py

Output:
    - calibration_results.txt  (human-readable report)
    - calibration_raw.csv      (raw data for spreadsheet review)
"""

import chromadb
import yaml
import json
import csv
import os
from pathlib import Path
from sentence_transformers import SentenceTransformer




BASE_DIR        = Path(__file__).parent
CONFIG_PATH     = BASE_DIR / "config" / "config.yaml"
CHROMA_STORAGE  = BASE_DIR / "chroma_storage"










TEST_QUERIES = [


    ("Where is Puraran Beach?",                          "specific_place",  "perfect"),
    ("Where is Binurong Point located?",                 "specific_place",  "perfect"),
    ("Where is Nitto Lodge?",                            "specific_place",  "perfect"),
    ("Where is Twin Rock Beach Resort?",                 "specific_place",  "perfect"),
    ("Where is Maribina Falls?",                         "specific_place",  "perfect"),
    ("Where is E-Crown Hotel and Resort?",               "specific_place",  "perfect"),
    ("Where is Tuwad-Tuwadan Blue Lagoon?",              "specific_place",  "perfect"),
    ("Where is Virac Airport?",                          "specific_place",  "perfect"),
    ("Where is Rhaj Inn?",                               "specific_place",  "perfect"),
    ("Where is Nahulugan Falls?",                        "specific_place",  "perfect"),


    ("hotels in virac",                                  "browsing",        "perfect"),
    ("beaches in catanduanes for swimming",              "browsing",        "perfect"),
    ("waterfalls near virac",                            "browsing",        "perfect"),
    ("where to eat cheap in virac",                      "browsing",        "perfect"),
    ("tourist spots in baras",                           "browsing",        "perfect"),
    ("coffee shops virac",                               "browsing",        "perfect"),
    ("resorts in pandan catanduanes",                    "browsing",        "perfect"),
    ("accommodation in bato",                            "browsing",        "partial"),
    ("restaurants in gigmoto",                           "browsing",        "partial"),
    ("budget hotels catanduanes",                        "browsing",        "perfect"),


    ("how much is the entrance fee at Binurong Point",   "budget",          "perfect"),
    ("how much does it cost to surf at Puraran",         "budget",          "perfect"),
    ("how much is the ferry from tabaco to virac",       "budget",          "perfect"),
    ("how much is a stay per night in e-crown hotel",    "budget",          "none"),
    ("how much is Twin Rock Beach Resort entrance fee",  "budget",          "perfect"),
    ("how much is maribina falls entrance",              "budget",          "perfect"),
    ("how much is habal-habal hire in virac",            "budget",          "partial"),
    ("cost of visiting tuwad-tuwadan blue lagoon",       "budget",          "perfect"),
    ("price of guided tour binurong point",              "budget",          "perfect"),
    ("how much is the boat to palumbanes island",        "budget",          "perfect"),


    ("is there grab in catanduanes",                     "logistics",       "perfect"),
    ("what time is the last ferry from catanduanes",     "logistics",       "perfect"),
    ("is the tap water safe to drink",                   "logistics",       "perfect"),
    ("are there jellyfish in catanduanes beaches",       "logistics",       "perfect"),
    ("how do i get from virac to puraran beach",         "transport",       "perfect"),
    ("how do i get to catanduanes from manila",          "transport",       "perfect"),
    ("is there mobile signal in baras catanduanes",      "logistics",       "perfect"),
    ("what to do if my flight gets cancelled",           "logistics",       "perfect"),
    ("is it safe to swim at puraran beach",              "safety",          "perfect"),
    ("emergency numbers catanduanes",                    "safety",          "perfect"),


    ("what is catanduanes known for",                    "general",         "perfect"),
    ("best time to visit catanduanes",                   "general",         "perfect"),
    ("is catanduanes safe for tourists",                 "general",         "perfect"),
    ("things to do in catanduanes",                      "general",         "perfect"),
    ("one day itinerary catanduanes",                    "general",         "perfect"),
    ("what language do they speak in catanduanes",       "general",         "perfect"),


    ("how much is the room rate at e-crown hotel",       "edge_no_answer",  "none"),
    ("does puraran beach have wifi",                     "edge_no_answer",  "none"),
    ("what is the phone number of twin rock resort",     "edge_no_answer",  "none"),
    ("is there a doctor at binurong point",              "edge_no_answer",  "none"),
    ("can i bring my pet dog to mamangal beach",         "edge_no_answer",  "none"),
    ("what is the room number of the manager at lumber", "edge_no_answer",  "none"),


    ("how to go to puraran",                             "alias",           "perfect"),
    ("majestic surf spot catanduanes",                   "alias",           "perfect"),
    ("e-crown hotel virac",                              "alias",           "perfect"),
    ("bato church catanduanes",                          "alias",           "perfect"),
    ("fertility island catanduanes",                     "alias",           "partial"),

]


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def get_collection(config):
    client = chromadb.PersistentClient(path=str(CHROMA_STORAGE))
    collection_name = config["rag"]["collection_name"]
    try:
        return client.get_collection(name=collection_name)
    except Exception as e:
        print(f"ERROR: Could not load collection '{collection_name}': {e}")
        print("Make sure you have run ingest.py first.")
        raise


def load_embedder(config):
    model_name = config["rag"].get("embedding_model", "all-MiniLM-L6-v2")
    print(f"  Loading embedding model: {model_name}")
    return SentenceTransformer(model_name)


def query_collection(collection, embedder, query_text, n_results=3):
    embedding = embedder.encode(query_text).tolist()
    results = collection.query(
        query_embeddings=[embedding],
        n_results=n_results,
        include=["documents", "metadatas", "distances"]
    )
    return results


def distance_to_similarity(distance):
    """Convert ChromaDB L2 distance to cosine-like similarity (0-1)."""




    if distance <= 1.0:

        return round(1.0 - distance, 4)
    else:

        return round(1.0 / (1.0 + distance), 4)


def run_calibration():
    print("=" * 65)
    print("  PATHFINDER RAG CALIBRATION TOOL")
    print("=" * 65)

    config = load_config()
    print("\n[1/3] Loading ChromaDB collection...")
    collection = get_collection(config)
    print(f"  Collection loaded: {collection.count()} documents")

    print("\n[2/3] Loading embedding model...")
    embedder = load_embedder(config)

    print(f"\n[3/3] Running {len(TEST_QUERIES)} test queries...\n")

    results_data = []
    category_stats = {}

    for i, (query, category, expected) in enumerate(TEST_QUERIES):
        raw = query_collection(collection, embedder, query, n_results=3)

        distances = raw["distances"][0] if raw["distances"] else []
        docs      = raw["documents"][0] if raw["documents"] else []
        metas     = raw["metadatas"][0] if raw["metadatas"] else []

        top1_sim  = distance_to_similarity(distances[0]) if distances else 0.0
        top2_sim  = distance_to_similarity(distances[1]) if len(distances) > 1 else 0.0
        top3_sim  = distance_to_similarity(distances[2]) if len(distances) > 2 else 0.0

        top1_doc  = docs[0][:80].replace("\n", " ") if docs else "—"
        top1_place = metas[0].get("place_name", "—") if metas else "—"
        top1_title = metas[0].get("title", "—") if metas else "—"


        if top1_sim >= 0.80:
            auto_verdict = "HIGH"
        elif top1_sim >= 0.65:
            auto_verdict = "MEDIUM"
        elif top1_sim >= 0.50:
            auto_verdict = "LOW"
        else:
            auto_verdict = "VERY_LOW"

        results_data.append({
            "query":       query,
            "category":    category,
            "expected":    expected,
            "top1_score":  top1_sim,
            "top2_score":  top2_sim,
            "top3_score":  top3_sim,
            "top1_title":  top1_title,
            "top1_place":  top1_place,
            "top1_doc":    top1_doc,
            "verdict":     auto_verdict,
        })


        if category not in category_stats:
            category_stats[category] = {"scores": [], "count": 0}
        category_stats[category]["scores"].append(top1_sim)
        category_stats[category]["count"] += 1

        status_icon = "✓" if expected == "perfect" and top1_sim >= 0.65 else\
                      "?" if expected == "partial" else\
                      "✓" if expected == "none" and top1_sim < 0.60 else "✗"

        print(f"  [{i+1:02d}] {status_icon} [{top1_sim:.3f}] {query[:50]:<50} → {top1_title[:35]}")


    csv_path = BASE_DIR / "calibration_raw.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results_data[0].keys()))
        writer.writeheader()
        writer.writerows(results_data)
    print(f"\n  Raw CSV saved: {csv_path}")


    generate_report(results_data, category_stats)


def generate_report(results, category_stats):
    report_path = BASE_DIR / "calibration_results.txt"

    all_scores        = [r["top1_score"] for r in results]
    perfect_scores    = [r["top1_score"] for r in results if r["expected"] == "perfect"]
    partial_scores    = [r["top1_score"] for r in results if r["expected"] == "partial"]
    none_scores       = [r["top1_score"] for r in results if r["expected"] == "none"]

    def avg(lst): return round(sum(lst) / len(lst), 4) if lst else 0
    def mn(lst):  return round(min(lst), 4) if lst else 0
    def mx(lst):  return round(max(lst), 4) if lst else 0


    bins = {}
    for threshold in [x / 100 for x in range(40, 90, 5)]:
        above_perfect = sum(1 for r in results if r["expected"] == "perfect" and r["top1_score"] >= threshold)
        above_wrong   = sum(1 for r in results if r["expected"] in ["partial","none"] and r["top1_score"] >= threshold)
        bins[threshold] = {"perfect": above_perfect, "wrong": above_wrong}

    lines = []
    lines.append("=" * 65)
    lines.append("  PATHFINDER CALIBRATION REPORT")
    lines.append("=" * 65)

    lines.append("\n── SCORE DISTRIBUTION BY EXPECTED ANSWER ──\n")
    lines.append(f"  PERFECT answers ({len(perfect_scores)} queries):")
    lines.append(f"    Avg: {avg(perfect_scores)}  |  Min: {mn(perfect_scores)}  |  Max: {mx(perfect_scores)}")
    lines.append(f"\n  PARTIAL answers ({len(partial_scores)} queries):")
    lines.append(f"    Avg: {avg(partial_scores)}  |  Min: {mn(partial_scores)}  |  Max: {mx(partial_scores)}")
    lines.append(f"\n  NO ANSWER ({len(none_scores)} queries):")
    lines.append(f"    Avg: {avg(none_scores)}  |  Min: {mn(none_scores)}  |  Max: {mx(none_scores)}")

    lines.append("\n── SCORES BY CATEGORY ──\n")
    for cat, stats in sorted(category_stats.items()):
        scores = stats["scores"]
        lines.append(f"  {cat:<20} n={stats['count']}   avg={avg(scores):.3f}   min={mn(scores):.3f}   max={mx(scores):.3f}")

    lines.append("\n── THRESHOLD ANALYSIS ──\n")
    lines.append(f"  {'Threshold':<12} {'Perfect ✓':<12} {'Wrong ✗':<12} {'Precision':<12}")
    lines.append(f"  {'-'*48}")
    for threshold, counts in sorted(bins.items()):
        total = counts["perfect"] + counts["wrong"]
        precision = round(counts["perfect"] / total, 3) if total > 0 else 0
        marker = " ◄ recommended" if 0.74 <= threshold <= 0.82 else ""
        lines.append(f"  {threshold:<12.2f} {counts['perfect']:<12} {counts['wrong']:<12} {precision:<12}{marker}")

    lines.append("\n── INDIVIDUAL RESULTS ──\n")
    lines.append(f"  {'Score':<8} {'Exp':<9} {'Category':<20} {'Query':<45} {'Top Result'}")
    lines.append(f"  {'-'*120}")
    for r in sorted(results, key=lambda x: x["top1_score"], reverse=True):
        flag = " ⚠" if r["expected"] == "none" and r["top1_score"] >= 0.65 else ""
        flag = flag or (" ✗" if r["expected"] == "perfect" and r["top1_score"] < 0.60 else "")
        lines.append(
            f"  {r['top1_score']:<8.3f} {r['expected']:<9} {r['category']:<20} "
            f"{r['query'][:44]:<45} {r['top1_title'][:35]}{flag}"
        )

    lines.append("\n── RECOMMENDATION ──\n")
    lines.append("  Copy this entire file and share it back with Claude.")
    lines.append("  He will analyze it and give you the exact threshold to use.")
    lines.append("\n  Key things he will look for:")
    lines.append("  1. The lowest score in the PERFECT group → your floor")
    lines.append("  2. The highest score in the NO ANSWER group → your ceiling")
    lines.append("  3. The breakpoint where precision drops below 0.80")
    lines.append("\n" + "=" * 65)

    report_text = "\n".join(lines)

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_text)

    print("\n" + report_text)
    print(f"\n  Full report saved: {report_path}")


if __name__ == "__main__":
    run_calibration()