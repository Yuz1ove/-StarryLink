from __future__ import annotations

from collections import defaultdict
from math import prod


def generate_candidates(network: dict, source: str, target: str, max_hops: int = 7, max_candidates: int = 24) -> list[dict]:
    nodes = {node["id"]: node for node in network["nodes"]}
    links = {link["id"]: link for link in network["links"]}
    adjacency: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for link in network["links"]:
        if link["status"] == "failed" or link["bandwidthKbps"] <= 0:
            continue
        if nodes[link["source"]]["status"] == "failed" or nodes[link["target"]]["status"] == "failed":
            continue
        adjacency[link["source"]].append((link["target"], link["id"]))
        if link.get("bidirectional", True):
            adjacency[link["target"]].append((link["source"], link["id"]))
    for edges in adjacency.values():
        edges.sort(key=lambda item: (item[0], item[1]))

    paths: list[tuple[list[str], list[str]]] = []

    def walk(current: str, path_nodes: list[str], path_links: list[str]) -> None:
        if len(paths) >= max_candidates:
            return
        if current == target:
            paths.append((path_nodes[:], path_links[:]))
            return
        if len(path_links) >= max_hops:
            return
        for next_node, link_id in adjacency.get(current, []):
            if next_node in path_nodes:
                continue
            walk(next_node, path_nodes + [next_node], path_links + [link_id])

    walk(source, [source], [])
    candidates = []
    for index, (path_nodes, path_links) in enumerate(paths, 1):
        route_links = [links[link_id] for link_id in path_links]
        route_nodes = [nodes[node_id] for node_id in path_nodes]
        reliability = prod(max(0, min(1, item["reliability"] * (1 - item["packetLoss"]))) for item in route_links)
        reliability *= prod(max(0, min(1, node["reliability"])) for node in route_nodes)
        energy = sum({"ground": 0.8, "sea": 1.0, "air": 4.5, "space": 7.2}[node["layer"]] for node in route_nodes)
        deploy = sum(75 if node["type"] == "uav_relay" else 30 if node["type"] == "mobile_relay" else 0 for node in route_nodes)
        candidates.append(
            {
                "id": f"candidate-{index:02d}",
                "nodes": path_nodes,
                "links": path_links,
                "estimatedLatency": round(sum(link["latencyMs"] for link in route_links) + sum(node["latencyMs"] for node in route_nodes), 2),
                "estimatedReliability": round(reliability, 6),
                "estimatedEnergyCost": round(energy, 2),
                "deploymentTimeSec": deploy,
                "availableBandwidth": round(min(link["bandwidthKbps"] for link in route_links), 2),
                "media": [link["medium"] for link in route_links],
            }
        )
    return sorted(candidates, key=lambda item: (item["estimatedLatency"], item["id"]))
