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
