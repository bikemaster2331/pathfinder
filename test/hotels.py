import overpy

api = overpy.Overpass()
query = """
[out:json][timeout:60];
area["name"="Catanduanes"]->.searchArea;
(
node["tourism"="hotel"](area.searchArea);
node["tourism"="guest_house"](area.searchArea);
node["tourism"="hostel"](area.searchArea);
node["tourism"="motel"](area.searchArea);
node["tourism"="resort"](area.searchArea);
);
out body;
"""
result = api.query(query)

for node in result.nodes:
    print(node.tags.get("name", "Unnamed"), node.lat, node.lon)
