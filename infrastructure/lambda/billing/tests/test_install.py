from conftest import get_user, make_event, make_subscription


def _session(sub_id="sub_1", intent="intent-1", user_id="u1", customer="cus_1"):
    return {
        "id": "cs_1",
        "object": "checkout.session",
        "subscription": sub_id,
        "customer": customer,
        "metadata": {"user_id": user_id, "org_id": "org1", "intent_id": intent},
    }


def test_matching_intent_installs_and_clears_pending(ddb_table, user_row, stripe_stub):
    import webhook

    user_row(pending_intent_id="intent-1")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(
        status="active", price="price_max"
    )
    out = webhook.handle_event(make_event("checkout.session.completed", _session()))
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["stripe_subscription_id"] == "sub_1"
    assert row["stripe_customer_id"] == "cus_1"
    assert row["plan"] == "max"
    assert row["subscription_status"] == "active"
    assert row["last_checkout_intent_id"] == "intent-1"
    assert "pending_intent_id" not in row
    assert int(row["billing_revision"]) == 1
    assert int(row["billing_source_event_created"]) == 1_700_000_000


def test_incomplete_subscription_installs_but_is_not_entitled(
    ddb_table, user_row, stripe_stub
):
    from plinths_auth.billing import effective_plan
    import webhook

    user_row(pending_intent_id="intent-1")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="incomplete")
    webhook.handle_event(make_event("checkout.session.completed", _session()))
    row = get_user(ddb_table)
    assert row["subscription_status"] == "incomplete"
    assert effective_plan(row) == "free"


def test_subscription_created_installs_from_subscription_metadata(
    ddb_table, user_row, stripe_stub
):
    import webhook

    user_row(pending_intent_id="intent-1")
    sub = make_subscription(status="active")
    stripe_stub["subscriptions"]["sub_1"] = sub
    out = webhook.handle_event(make_event("customer.subscription.created", sub))
    assert out == "applied"
    assert get_user(ddb_table)["stripe_subscription_id"] == "sub_1"


def test_second_install_event_for_same_subscription_is_noop(
    ddb_table, user_row, stripe_stub
):
    import webhook

    user_row(pending_intent_id="intent-1")
    sub = make_subscription(status="active")
    stripe_stub["subscriptions"]["sub_1"] = sub
    webhook.handle_event(
        make_event("checkout.session.completed", _session(), event_id="evt_a")
    )
    out = webhook.handle_event(
        make_event("customer.subscription.created", sub, event_id="evt_b")
    )
    assert out == "noop"
    assert int(get_user(ddb_table)["billing_revision"]) == 1


def test_stale_intent_not_live_is_dropped(ddb_table, user_row, stripe_stub):
    import webhook

    user_row(pending_intent_id="intent-2")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(
        status="incomplete_expired"
    )
    out = webhook.handle_event(
        make_event("checkout.session.completed", _session(intent="intent-1"))
    )
    assert out == "noop"
    assert "stripe_subscription_id" not in get_user(ddb_table)


def test_stale_intent_live_and_row_empty_installs_anyway(
    ddb_table, user_row, stripe_stub
):
    """Abandon tab A, start B, then complete A: A is the only real subscription."""
    import webhook

    user_row(pending_intent_id="intent-B")
    stripe_stub["subscriptions"]["sub_A"] = make_subscription(
        sub_id="sub_A", status="active"
    )
    out = webhook.handle_event(
        make_event(
            "checkout.session.completed", _session(sub_id="sub_A", intent="intent-A")
        )
    )
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["stripe_subscription_id"] == "sub_A"
    assert row["last_checkout_intent_id"] == "intent-A"


def test_stale_intent_with_different_live_subscription_cancels_newcomer(
    ddb_table, user_row, stripe_stub, monkeypatch
):
    import webhook

    seen = []
    monkeypatch.setattr(
        webhook.metrics, "add_metric", lambda **kw: seen.append(kw["name"])
    )
    user_row(stripe_subscription_id="sub_1", subscription_status="active", plan="pro")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(
        sub_id="sub_1", status="active"
    )
    stripe_stub["subscriptions"]["sub_2"] = make_subscription(
        sub_id="sub_2", status="active"
    )
    out = webhook.handle_event(
        make_event(
            "checkout.session.completed", _session(sub_id="sub_2", intent="intent-old")
        )
    )
    assert out == "noop"
    assert stripe_stub["cancelled"] == ["sub_2"]
    assert "DoubleSubscriptionCancelled" in seen
    assert get_user(ddb_table)["stripe_subscription_id"] == "sub_1"


def test_replacement_after_cancel_installs_new_id(ddb_table, user_row, stripe_stub):
    import webhook

    user_row(
        stripe_subscription_id="sub_old",
        subscription_status="canceled",
        plan="pro",
        billing_source_event_created=1_700_000_000,
        pending_intent_id="intent-new",
    )
    stripe_stub["subscriptions"]["sub_old"] = make_subscription(
        sub_id="sub_old", status="canceled"
    )
    stripe_stub["subscriptions"]["sub_new"] = make_subscription(
        sub_id="sub_new", status="active"
    )
    # Same created second as the old subscription's final event — must still install.
    out = webhook.handle_event(
        make_event(
            "checkout.session.completed",
            _session(sub_id="sub_new", intent="intent-new"),
            created=1_700_000_000,
        )
    )
    assert out == "applied"
    assert get_user(ddb_table)["stripe_subscription_id"] == "sub_new"


def test_orphan_user_returns_orphan_and_writes_nothing(
    ddb_table, stripe_stub, monkeypatch
):
    import webhook

    seen = []
    monkeypatch.setattr(
        webhook.metrics, "add_metric", lambda **kw: seen.append(kw["name"])
    )
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active")
    out = webhook.handle_event(
        make_event("checkout.session.completed", _session(user_id="ghost"))
    )
    assert out == "orphan"
    assert "WebhookOrphanUser" in seen


def test_missing_user_id_falls_back_to_customer_metadata(
    ddb_table, user_row, stripe_stub
):
    import webhook

    user_row(pending_intent_id="intent-1")
    stripe_stub["customers"]["cus_1"] = {"id": "cus_1", "metadata": {"user_id": "u1"}}
    sub = make_subscription(status="active", metadata={})
    stripe_stub["subscriptions"]["sub_1"] = sub
    out = webhook.handle_event(make_event("customer.subscription.created", sub))
    assert out == "applied"


def test_unhandled_event_type_is_ignored(ddb_table):
    import webhook

    assert (
        webhook.handle_event(make_event("customer.subscription.trial_will_end", {}))
        == "ignored"
    )
