from scoring import _top_sources


def test_top_sources_labels_by_domain_and_dedupes():
    results = [
        {"title": "Fitness Market Size 2025 - Grand View Research",
         "url": "https://www.grandviewresearch.com/report", "description": ""},
        {"title": "Statista fitness", "url": "https://www.statista.com/x", "description": ""},
        {"title": "dupe", "url": "https://www.grandviewresearch.com/report", "description": ""},
    ]
    out = _top_sources(results, n=2)
    assert out == [
        {"label": "Grand View Research", "url": "https://www.grandviewresearch.com/report"},
        {"label": "Statista", "url": "https://www.statista.com/x"},
    ]


def test_top_sources_empty():
    assert _top_sources([], n=2) == []


def test_top_sources_no_subdomain_false_match():
    # notreddit.com must NOT be labeled "Reddit"
    out = _top_sources([{"title": "x", "url": "https://notreddit.com/a", "description": ""}], n=1)
    assert out[0]["label"] != "Reddit"
    assert out[0]["label"] == "Notreddit"
    # a real reddit subdomain still maps
    out2 = _top_sources([{"title": "x", "url": "https://old.reddit.com/r/x", "description": ""}], n=1)
    assert out2[0]["label"] == "Reddit"
