from assembly import assemble_v2
from tests.test_assembly import _fixtures


def test_v2_contract_surface():
    out = assemble_v2(*_fixtures())
    # bands
    assert "bands" in out
    # market block
    for k in ("tam", "growth", "note", "tier", "sources"):
        assert k in out["market"], f"market missing {k}"
    # why_now
    for k in ("shift", "tier", "sources"):
        assert k in out["why_now"], f"why_now missing {k}"
    # entry_cost items
    for f in out["entry_cost"]:
        assert {"label", "value", "tier", "sources"} <= set(f)
    # read
    assert {"synthesis", "recommendation", "limit"} <= set(out["read"])
    # competitors enriched
    for c in out["competitors"]:
        assert "url" in c and "funding_stage" in c
    # gaps enriched
    for g in out["gaps"]:
        assert {"severity", "underserved", "tags", "quotes"} <= set(g)
    # legacy still present (frontend back-compat during transition)
    assert "saturation_score" in out and "roadmap" in out
