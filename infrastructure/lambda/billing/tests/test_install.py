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
    assert row["last_checkout_outcome"] == "installed"
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
    assert out == "applied"
    assert stripe_stub["cancelled"] == ["sub_2"]
    assert "DoubleSubscriptionCancelled" in seen
    row = get_user(ddb_table)
    assert row["stripe_subscription_id"] == "sub_1"
    # The poll needs a terminal answer, not a 60 s spin ending in a false failure.
    assert row["last_checkout_outcome"] == "cancelled_duplicate"
    assert row["last_checkout_intent_id"] == "intent-old"
    assert "pending_intent_id" not in row
    assert int(row["billing_revision"]) == 1


def test_matching_intent_does_not_overwrite_different_live_subscription(
    ddb_table, user_row, stripe_stub
):
    """A matching intent is not enough on its own: if the row already holds a
    *different* live subscription, installing over it would silently drop
    the kept subscription. This must fall through to the same
    cancel-newcomer path as the reconcile branch."""
    import webhook

    user_row(
        stripe_subscription_id="sub_1",
        subscription_status="active",
        plan="pro",
        pending_intent_id="intent-2",
    )
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(
        sub_id="sub_1", status="active"
    )
    stripe_stub["subscriptions"]["sub_2"] = make_subscription(
        sub_id="sub_2", status="active"
    )
    out = webhook.handle_event(
        make_event(
            "checkout.session.completed", _session(sub_id="sub_2", intent="intent-2")
        )
    )
    assert out == "applied"
    assert stripe_stub["cancelled"] == ["sub_2"]
    row = get_user(ddb_table)
    assert row["stripe_subscription_id"] == "sub_1"
    assert row["last_checkout_outcome"] == "cancelled_duplicate"
    assert row["last_checkout_intent_id"] == "intent-2"
    assert "pending_intent_id" not in row
    assert int(row["billing_revision"]) == 1


def test_install_replaces_incomplete_recorded_subscription(
    ddb_table, user_row, stripe_stub
):
    """The recorded subscription is `incomplete` — an abandoned checkout that
    never charged. It must not survive as the double-subscription "kept" one:
    cancel it and install the newcomer."""
    import webhook

    user_row(
        stripe_subscription_id="sub_1",
        subscription_status="incomplete",
        plan="pro",
        pending_intent_id="intent-2",
    )
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(
        sub_id="sub_1", status="incomplete"
    )
    stripe_stub["subscriptions"]["sub_2"] = make_subscription(
        sub_id="sub_2", status="active"
    )
    out = webhook.handle_event(
        make_event(
            "checkout.session.completed", _session(sub_id="sub_2", intent="intent-2")
        )
    )
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["stripe_subscription_id"] == "sub_2"
    assert row["subscription_status"] == "active"
    assert row["last_checkout_outcome"] == "installed"
    assert stripe_stub["cancelled"] == ["sub_1"]


def test_reconcile_install_replaces_dead_recorded_subscription_without_intent(
    ddb_table, user_row, stripe_stub
):
    import webhook

    user_row(
        stripe_subscription_id="sub_old", subscription_status="canceled", plan="pro"
    )
    stripe_stub["subscriptions"]["sub_old"] = make_subscription(
        sub_id="sub_old", status="canceled"
    )
    sub_new = make_subscription(
        sub_id="sub_new", status="active", metadata={"user_id": "u1"}
    )
    stripe_stub["subscriptions"]["sub_new"] = sub_new
    out = webhook.handle_event(make_event("customer.subscription.created", sub_new))
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["stripe_subscription_id"] == "sub_new"
    assert "last_checkout_intent_id" not in row


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


def test_install_clears_stale_grace(ddb_table, user_row, stripe_stub):
    import webhook

    user_row(pending_intent_id="intent-1", entitlement_grace_until=1_600_000_000)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active")
    out = webhook.handle_event(make_event("checkout.session.completed", _session()))
    assert out == "applied"
    row = get_user(ddb_table)
    assert "entitlement_grace_until" not in row


def test_reconcile_install_without_intent_leaves_last_intent_untouched(
    ddb_table, user_row, stripe_stub
):
    import webhook

    user_row(last_checkout_intent_id="old")
    sub = make_subscription(status="active", metadata={})
    stripe_stub["subscriptions"]["sub_1"] = sub
    session = _session()
    session["metadata"] = {"user_id": "u1", "org_id": "org1"}  # no intent_id anywhere
    out = webhook.handle_event(make_event("checkout.session.completed", session))
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["stripe_subscription_id"] == "sub_1"
    assert row["last_checkout_intent_id"] == "old"


def test_install_race_reclassifies_and_cancels_loser(
    ddb_table, user_row, stripe_stub, monkeypatch
):
    """A concurrent install (winner) commits between our snapshot read and
    our transaction attempt. Our condition fails (STALE); we must re-read
    and reclassify rather than report stale — the re-read sees the winner's
    subscription installed and routes us into the double-subscription
    branch, cancelling our (losing) subscription."""
    import store
    import webhook

    seen = []
    monkeypatch.setattr(
        webhook.metrics, "add_metric", lambda **kw: seen.append(kw["name"])
    )

    user_row(pending_intent_id="intent-other")
    stripe_stub["subscriptions"]["sub_winner"] = make_subscription(
        sub_id="sub_winner", status="active"
    )
    stripe_stub["subscriptions"]["sub_loser"] = make_subscription(
        sub_id="sub_loser", status="active"
    )

    real_apply_event = store.apply_event
    calls = []

    def fake_apply_event(event_id, user_id, update):
        calls.append(update)
        if len(calls) == 1:
            # Simulate a concurrent winner installing sub_winner between our
            # snapshot read and our transaction attempt.
            ddb_table.update_item(
                Key={"pk": "USER#u1", "sk": "USER#u1"},
                UpdateExpression=(
                    "SET stripe_subscription_id = :s, subscription_status = :st "
                    "REMOVE pending_intent_id"
                ),
                ExpressionAttributeValues={":s": "sub_winner", ":st": "active"},
            )
            return store.Outcome.STALE
        return real_apply_event(event_id, user_id, update)

    monkeypatch.setattr(store, "apply_event", fake_apply_event)

    out = webhook.handle_event(
        make_event(
            "customer.subscription.created", stripe_stub["subscriptions"]["sub_loser"]
        )
    )
    assert out == "applied"
    assert "sub_loser" in stripe_stub["cancelled"]
    assert "DoubleSubscriptionCancelled" in seen
    assert get_user(ddb_table)["last_checkout_outcome"] == "cancelled_duplicate"
