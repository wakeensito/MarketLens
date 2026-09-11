from conftest import get_user


def _upd(**values):
    """A minimal SET update with a condition that always passes."""
    import store

    names = {f"#{k}": k for k in values}
    vals = {f":{k}": store.serialize(v) for k, v in values.items()}
    return {
        "UpdateExpression": "SET " + ", ".join(f"#{k} = :{k}" for k in values),
        "ConditionExpression": "attribute_exists(pk)",
        "ExpressionAttributeNames": names,
        "ExpressionAttributeValues": vals,
    }


def test_apply_writes_marker_and_row(ddb_table, user_row):
    import store

    user_row()
    out = store.apply_event("evt_1", "u1", _upd(subscription_status="active"))
    assert out is store.Outcome.APPLIED
    assert get_user(ddb_table)["subscription_status"] == "active"
    marker = ddb_table.get_item(
        Key={"pk": "BILLING_EVENT#evt_1", "sk": "BILLING_EVENT#evt_1"}
    )["Item"]
    assert marker["ttl"] > 0


def test_duplicate_event_writes_nothing(ddb_table, user_row):
    import store

    user_row()
    store.apply_event("evt_1", "u1", _upd(subscription_status="active"))
    out = store.apply_event("evt_1", "u1", _upd(subscription_status="canceled"))
    assert out is store.Outcome.DUPLICATE
    assert get_user(ddb_table)["subscription_status"] == "active"


def test_failed_row_condition_is_stale_and_marker_not_written(ddb_table, user_row):
    import store

    user_row()
    upd = _upd(subscription_status="active")
    upd["ConditionExpression"] = "attribute_not_exists(pk)"  # will fail: row exists
    out = store.apply_event("evt_2", "u1", upd)
    assert out is store.Outcome.STALE
    assert "subscription_status" not in get_user(ddb_table)
    # A stale event may be redelivered legitimately later; it is not marked processed.
    assert "Item" not in ddb_table.get_item(
        Key={"pk": "BILLING_EVENT#evt_2", "sk": "BILLING_EVENT#evt_2"}
    )


def test_marker_only_noop(ddb_table, user_row):
    import store

    user_row()
    out = store.apply_event("evt_3", None, None)
    assert out is store.Outcome.NOOP
    assert "Item" in ddb_table.get_item(
        Key={"pk": "BILLING_EVENT#evt_3", "sk": "BILLING_EVENT#evt_3"}
    )


def test_noop_then_same_event_is_duplicate(ddb_table, user_row):
    import store

    user_row()
    store.apply_event("evt_3", None, None)
    assert store.apply_event("evt_3", None, None) is store.Outcome.DUPLICATE


def test_get_user_and_pending_intent(ddb_table, user_row):
    import store

    user_row()
    store.set_pending_intent("u1", "intent-9")
    assert store.get_user("u1")["pending_intent_id"] == "intent-9"
    assert store.get_user("nobody") is None


def test_serialize_numbers_and_bools():
    import store

    assert store.serialize(5) == {"N": "5"}
    assert store.serialize(True) == {"BOOL": True}
    assert store.serialize("x") == {"S": "x"}
