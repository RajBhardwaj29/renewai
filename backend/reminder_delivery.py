"""One delivery path for Cron and manual sends; provider work requires a DB claim."""
from datetime import datetime, timedelta, timezone
import logging

import database
from email_service import build_renewal_reminder_payload, send_reminder_payload, sender_uses_test_domain, sender_status
import gmail_mail
from reminder_rules import delivery_reason

logger = logging.getLogger("renewai.reminder_delivery")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(handler)
logger.propagate = False


def finish_delivery(result, organization_id, run_id):
    logger.info("REMINDER_ORG_COMPLETE run_id=%s organization_id=%s found=%s accepted=%s failed=%s skipped=%s in_progress=%s needs_review=%s",
                run_id, organization_id, result["due_found"], result["sent_count"], result["failed_count"],
                result["skipped_count"], result["in_progress_count"], result["needs_review_count"])
    return result


def organization_recipient(organization_id):
    members = (database.supabase.table("organization_members").select("user_id,role")
               .eq("organization_id", organization_id).execute().data or [])
    if not members:
        raise RuntimeError("No reminder recipient is configured.")
    # Both entry points use the same recipient policy, including concurrent runs.
    member = sorted(members, key=lambda m: (m.get("role") != "owner", str(m["user_id"])))[0]
    user = database.supabase.auth.admin.get_user_by_id(member["user_id"]).user
    if not user or not user.email:
        raise RuntimeError("No reminder recipient is configured.")
    return user.email


def failure_message(code):
    if code in {"needs_review", "idempotency_window_expired", "gmail_delivery_unconfirmed"}:
        return "Delivery is unconfirmed and needs review. Check the email provider before sending again."
    if code == "receipt_unconfirmed":
        return "The email provider accepted this reminder, but its saved status could not be confirmed. Please check delivery status."
    return "This reminder could not be confirmed as sent. A safe retry uses the same delivery request."


def deliver_due_reminders(organization_id, run_id):
    candidates = database.get_pending_due_reminders_for_delivery(organization_id, include_ineligible=True)
    result = {"due_found": len(candidates), "sent_count": 0, "failed_count": 0, "skipped_count": 0,
              "in_progress_count": 0, "needs_review_count": 0, "reconciled_count": 0,
              "processing_errors": 0, "sent": [], "failed": []}
    eligible = []
    for reminder in candidates:
        reason = delivery_reason(reminder)
        if reason == "eligible":
            eligible.append(reminder)
        else:
            result["skipped_count"] += 1
            logger.info("REMINDER_SKIPPED run_id=%s reminder_id=%s reason=%s", run_id, reminder["id"], reason)
    if not eligible:
        return finish_delivery(result, organization_id, run_id)
    try:
        recipient = organization_recipient(organization_id)
    except Exception as exc:
        result["processing_errors"] += 1
        result["failed_count"] = len(eligible)
        result["failed"] = [{"reminder_id": r["id"], "vendor_name": "Contract", "reminder_type": r["reminder_type"],
                             "error": "A reminder recipient could not be loaded. Please try again."} for r in eligible]
        logger.warning("REMINDER_RECIPIENT_FAILED run_id=%s organization_id=%s error_type=%s",
                       run_id, organization_id, type(exc).__name__)
        return finish_delivery(result, organization_id, run_id)

    for reminder in eligible:
        contract = reminder["contracts"]
        reminder_id = reminder["id"]
        claim = None
        gmail_dispatch_started = False
        error_code = "provider_request_failed"
        try:
            payload = build_renewal_reminder_payload(
                recipient_email=recipient, vendor_name=contract.get("vendor_name") or "Unknown Vendor",
                contract_title=contract.get("contract_title") or "Contract", reminder_type=reminder["reminder_type"],
                remind_on=reminder["remind_on"], cancellation_deadline=contract["cancellation_deadline"],
                renewal_date=contract.get("effective_renewal_date"),
                reminder_id=reminder_id,
            )
            claim = database.claim_reminder_delivery(organization_id, reminder_id, contract["cancellation_deadline"], payload)
            if not isinstance(claim, dict):
                claim = None
                raise RuntimeError("Reminder safety checks are unavailable.")
            outcome = claim.get("outcome")
            if outcome in {"busy", "skipped", "already_accepted"}:
                result["skipped_count"] += 1
                result["in_progress_count"] += outcome == "busy"
                result["reconciled_count"] += outcome == "already_accepted"
                logger.info("REMINDER_SKIPPED run_id=%s reminder_id=%s reason=%s", run_id, reminder_id, outcome)
                continue
            if outcome == "needs_review":
                result["needs_review_count"] += 1
                error_code = "needs_review"
                raise RuntimeError("Delivery reconciliation required.")
            if outcome != "claimed" or not claim.get("claim_token") or not claim.get("idempotency_key"):
                raise RuntimeError("Reminder safety checks are unavailable.")

            # Retries reuse the database's original payload, including its recipient
            # and sender. Rebuilding a body under the same provider key is unsafe.
            now = datetime.now(timezone.utc)
            if now >= datetime.fromisoformat(claim["send_before"].replace("Z", "+00:00")):
                error_code = "idempotency_window_expired"
                result["needs_review_count"] += 1
                raise RuntimeError("Safe retry window expired.")
            if now >= datetime.fromisoformat(claim["lease_until"].replace("Z", "+00:00")):
                error_code = "claim_expired"
                raise RuntimeError("Delivery claim expired before dispatch.")
            if claim["payload"].get("_provider") == "gmail":
                prepared = gmail_mail.prepare(claim["payload"], claim["idempotency_key"])
                # Persist BEFORE the only Gmail POST. A lost RPC response also
                # fails closed: the next claim sees the durable dispatch marker.
                gmail_dispatch_started = True
                if not database.begin_gmail_reminder_delivery(organization_id, reminder_id, claim["claim_token"]):
                    raise RuntimeError("Gmail dispatch reservation could not be confirmed.")
                response = send_reminder_payload(claim["payload"], claim["idempotency_key"], gmail_prepared=prepared)
            else:
                response = send_reminder_payload(claim["payload"], claim["idempotency_key"])
            provider_id = response.get("id") if isinstance(response, dict) else None
            if not isinstance(provider_id, str) or not provider_id.strip():
                error_code = "invalid_provider_response"
                raise RuntimeError("Missing provider acceptance receipt.")
            error_code = "receipt_unconfirmed"
            recorded = False
            # Retry only the idempotent database receipt write, never a new send.
            for _attempt in range(3):
                try:
                    recorded = database.complete_reminder_delivery(organization_id, reminder_id, claim["claim_token"], provider_id)
                    if recorded:
                        break
                except Exception:
                    pass
            if not recorded:
                raise RuntimeError("Provider receipt persistence is unconfirmed.")
            result["sent_count"] += 1
            result["sent"].append({"reminder_id": reminder_id, "vendor_name": contract.get("vendor_name") or "Contract",
                                   "reminder_type": reminder["reminder_type"], "recipient": claim["payload"]["to"][0], "status": "sent"})
            logger.info("REMINDER_ACCEPTED run_id=%s organization_id=%s reminder_id=%s provider_email_id=%s",
                        run_id, organization_id, reminder_id, provider_id)
        except Exception as exc:
            if gmail_dispatch_started:
                error_code = "gmail_delivery_unconfirmed"
                result["needs_review_count"] += 1
            if claim and claim.get("outcome") == "claimed" and claim.get("claim_token"):
                try:
                    database.fail_reminder_delivery(organization_id, reminder_id, claim["claim_token"], error_code)
                except Exception:
                    # The claim remains durable even if this best-effort write fails.
                    logger.warning("REMINDER_FAILURE_RECORD_UNCONFIRMED run_id=%s reminder_id=%s", run_id, reminder_id)
            result["failed_count"] += 1
            result["failed"].append({"reminder_id": reminder_id, "vendor_name": contract.get("vendor_name") or "Contract",
                                     "reminder_type": reminder["reminder_type"], "error": failure_message(error_code)})
            logger.warning("REMINDER_DELIVERY_FAILED run_id=%s organization_id=%s reminder_id=%s code=%s error_type=%s",
                           run_id, organization_id, reminder_id, error_code, type(exc).__name__)
    return finish_delivery(result, organization_id, run_id)


def delivery_health(organization_id):
    now = datetime.now(timezone.utc)
    result = {"processing": 0, "retryable": 0, "needs_review": 0, "accepted": 0,
              "test_sender": sender_uses_test_domain(), **sender_status()}
    for row in database.get_reminder_delivery_health(organization_id):
        state = row["state"]
        if state != "accepted":
            first = datetime.fromisoformat(row["first_attempt_at"].replace("Z", "+00:00"))
            lease = datetime.fromisoformat(row["lease_until"].replace("Z", "+00:00")) if row.get("lease_until") else None
            if (state == "needs_review" or first <= now - timedelta(hours=23)
                    or (row.get("dispatched_at") and (state != "processing" or not lease or lease <= now))):
                state = "needs_review"
            elif state == "processing" and (not lease or lease <= now):
                state = "retryable"
        result[state] += 1
    return result
