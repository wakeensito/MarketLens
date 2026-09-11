from conftest import make_subscription


def test_plan_from_subscription_maps_monthly_and_annual_to_one_plan():
    import stripe_client

    assert (
        stripe_client.plan_from_subscription(make_subscription(price="price_pro"))
        == "pro"
    )
    assert (
        stripe_client.plan_from_subscription(make_subscription(price="price_pro_a"))
        == "pro"
    )
    assert (
        stripe_client.plan_from_subscription(make_subscription(price="price_max"))
        == "max"
    )
    assert (
        stripe_client.plan_from_subscription(make_subscription(price="price_max_a"))
        == "max"
    )


def test_unknown_price_fails_toward_free(monkeypatch):
    import stripe_client

    seen = []
    monkeypatch.setattr(
        stripe_client.metrics, "add_metric", lambda **kw: seen.append(kw["name"])
    )
    assert (
        stripe_client.plan_from_subscription(make_subscription(price="price_zzz"))
        == "free"
    )
    assert "UnknownPriceId" in seen


def test_no_items_is_free():
    import stripe_client

    assert stripe_client.plan_from_subscription({"items": {"data": []}}) == "free"


def test_is_live():
    import stripe_client

    assert stripe_client.is_live(make_subscription(status="active"))
    assert stripe_client.is_live(make_subscription(status="past_due"))
    assert stripe_client.is_live(make_subscription(status="incomplete"))
    assert not stripe_client.is_live(make_subscription(status="canceled"))
    assert not stripe_client.is_live(make_subscription(status="incomplete_expired"))


def test_subscription_id_from_invoice_both_api_shapes():
    import stripe_client

    assert (
        stripe_client.subscription_id_from_invoice({"subscription": "sub_a"}) == "sub_a"
    )
    assert (
        stripe_client.subscription_id_from_invoice(
            {"parent": {"subscription_details": {"subscription": "sub_b"}}}
        )
        == "sub_b"
    )
    assert stripe_client.subscription_id_from_invoice({}) is None


def test_user_id_from_customer_reads_metadata(stripe_stub):
    import stripe_client

    stripe_stub["customers"]["cus_9"] = {"id": "cus_9", "metadata": {"user_id": "u9"}}
    assert stripe_client.user_id_from_customer("cus_9") == "u9"
    assert stripe_client.user_id_from_customer("cus_none") is None


def test_configure_sets_timeouts(monkeypatch):
    import stripe
    import stripe_client

    monkeypatch.setattr(stripe_client, "_get_param", lambda name: "sk_test_x")
    stripe_client._configured = False
    stripe_client.configure()
    assert stripe.api_key == "sk_test_x"
    assert stripe.max_network_retries == 2
    assert stripe.default_http_client._timeout == 10
