from conftest import get_user, make_event, make_subscription

T0 = 1_700_000_000
GRACE = 604_800


def _installed(user_row, **over):
    base = dict(
        stripe_subscription_id="sub_1",
        stripe_customer_id="cus_1",
        plan="pro",
        subscription_status="active",
        billing_source_event_created=T0,
        billing_revision=1,
    )
    base.update(over)
    return user_row(**base)


def test_updated_changes_plan_and_bumps_revision(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    sub = make_subscription(status="active", price="price_max")
    stripe_stub["subscriptions"]["sub_1"] = sub
    out = webhook.handle_event(
        make_event("customer.subscription.updated", sub, created=T0 + 10)
    )
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["plan"] == "max" and int(row["billing_revision"]) == 2
    assert int(row["billing_source_event_created"]) == T0 + 10


def test_monthly_to_annual_bumps_revision_without_plan_change(
    ddb_table, user_row, stripe_stub
):
    import webhook

    _installed(user_row, current_period_end=1)
    sub = make_subscription(status="active", price="price_pro_a", current_period_end=2)
    stripe_stub["subscriptions"]["sub_1"] = sub
    webhook.handle_event(
        make_event("customer.subscription.updated", sub, created=T0 + 10)
    )
    row = get_user(ddb_table)
    assert row["plan"] == "pro" and int(row["billing_revision"]) == 2


def test_no_change_writes_nothing_and_no_bump(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row, cancel_at_period_end=False, current_period_end=1_800_000_000)
    sub = make_subscription(status="active")
    stripe_stub["subscriptions"]["sub_1"] = sub
    out = webhook.handle_event(
        make_event("customer.subscription.updated", sub, created=T0 + 10)
    )
    assert out == "noop"
    assert int(get_user(ddb_table)["billing_revision"]) == 1


def test_older_event_is_stale(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    sub = make_subscription(status="active", price="price_max")
    stripe_stub["subscriptions"]["sub_1"] = sub
    out = webhook.handle_event(
        make_event("customer.subscription.updated", sub, created=T0 - 1)
    )
    assert out == "stale"
    assert get_user(ddb_table)["plan"] == "pro"


def test_equal_timestamp_applies_refetched_truth(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    sub = make_subscription(status="active", price="price_max")
    stripe_stub["subscriptions"]["sub_1"] = sub
    assert (
        webhook.handle_event(
            make_event("customer.subscription.updated", sub, created=T0)
        )
        == "applied"
    )
    assert get_user(ddb_table)["plan"] == "max"


def test_event_for_other_subscription_id_is_stale(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    other = make_subscription(sub_id="sub_9", status="active", price="price_max")
    stripe_stub["subscriptions"]["sub_9"] = other
    out = webhook.handle_event(
        make_event("customer.subscription.updated", other, created=T0 + 99)
    )
    assert out == "stale"
    assert get_user(ddb_table)["stripe_subscription_id"] == "sub_1"


def test_deleted_then_late_updated_stays_canceled(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="canceled")
    assert (
        webhook.handle_event(
            make_event(
                "customer.subscription.deleted",
                stripe_stub["subscriptions"]["sub_1"],
                event_id="e1",
                created=T0 + 5,
            )
        )
        == "applied"
    )
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active")
    out = webhook.handle_event(
        make_event(
            "customer.subscription.updated",
            stripe_stub["subscriptions"]["sub_1"],
            event_id="e2",
            created=T0 + 9,
        )
    )
    assert out == "stale"
    row = get_user(ddb_table)
    assert row["subscription_status"] == "canceled" and row["plan"] == "pro"


def test_paused_and_resumed(ddb_table, user_row, stripe_stub):
    from plinths_auth.billing import effective_plan
    import webhook

    _installed(user_row)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="paused")
    webhook.handle_event(
        make_event(
            "customer.subscription.paused",
            stripe_stub["subscriptions"]["sub_1"],
            event_id="e1",
            created=T0 + 1,
        )
    )
    assert effective_plan(get_user(ddb_table)) == "free"
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active")
    webhook.handle_event(
        make_event(
            "customer.subscription.resumed",
            stripe_stub["subscriptions"]["sub_1"],
            event_id="e2",
            created=T0 + 2,
        )
    )
    assert effective_plan(get_user(ddb_table)) == "pro"


def test_payment_failed_from_active_sets_grace(ddb_table, user_row, stripe_stub):
    from plinths_auth.billing import effective_plan
    import webhook

    _installed(user_row)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="past_due")
    invoice = {
        "id": "in_1",
        "object": "invoice",
        "customer": "cus_1",
        "subscription": "sub_1",
    }
    out = webhook.handle_event(
        make_event("invoice.payment_failed", invoice, created=T0 + 10)
    )
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["subscription_status"] == "past_due"
    assert int(row["entitlement_grace_until"]) == T0 + 10 + GRACE
    assert effective_plan(row, T0 + 11) == "pro"
    assert effective_plan(row, T0 + 11 + GRACE) == "free"


def test_payment_failed_on_never_entitled_gets_no_grace(
    ddb_table, user_row, stripe_stub
):
    import webhook

    _installed(user_row, subscription_status="incomplete")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="past_due")
    webhook.handle_event(
        make_event("invoice.payment_failed", {"subscription": "sub_1"}, created=T0 + 10)
    )
    row = get_user(ddb_table)
    assert row["subscription_status"] == "past_due"
    assert "entitlement_grace_until" not in row


def test_recovery_clears_grace(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(
        user_row, subscription_status="past_due", entitlement_grace_until=T0 + GRACE
    )
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active")
    webhook.handle_event(
        make_event(
            "customer.subscription.updated",
            stripe_stub["subscriptions"]["sub_1"],
            created=T0 + 20,
        )
    )
    row = get_user(ddb_table)
    assert row["subscription_status"] == "active"
    assert "entitlement_grace_until" not in row


def test_payment_failed_new_invoice_shape(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="past_due")
    invoice = {"parent": {"subscription_details": {"subscription": "sub_1"}}}
    assert (
        webhook.handle_event(
            make_event("invoice.payment_failed", invoice, created=T0 + 10)
        )
        == "applied"
    )


def test_payment_failed_without_subscription_is_ignored(
    ddb_table, user_row, stripe_stub
):
    import webhook

    _installed(user_row)
    assert (
        webhook.handle_event(make_event("invoice.payment_failed", {"id": "in_x"}))
        == "ignored"
    )


def test_unknown_price_on_live_subscription_writes_free(
    ddb_table, user_row, stripe_stub
):
    import webhook

    _installed(user_row)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(
        status="active", price="price_gone"
    )
    webhook.handle_event(
        make_event(
            "customer.subscription.updated",
            stripe_stub["subscriptions"]["sub_1"],
            created=T0 + 1,
        )
    )
    assert get_user(ddb_table)["plan"] == "free"


def test_duplicate_delivery_is_duplicate(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    sub = make_subscription(status="active", price="price_max")
    stripe_stub["subscriptions"]["sub_1"] = sub
    ev = make_event(
        "customer.subscription.updated", sub, event_id="same", created=T0 + 1
    )
    assert webhook.handle_event(ev) == "applied"
    assert webhook.handle_event(ev) == "duplicate"
    assert int(get_user(ddb_table)["billing_revision"]) == 2


def test_state_event_for_orphan_user(ddb_table, stripe_stub):
    import webhook

    sub = make_subscription(status="active")
    stripe_stub["subscriptions"]["sub_1"] = sub
    assert (
        webhook.handle_event(make_event("customer.subscription.updated", sub))
        == "orphan"
    )
