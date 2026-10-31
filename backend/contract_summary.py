"""Shareable, read-only PDF snapshot. No model calls or private workflow notes."""
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from html import escape
from io import BytesIO
import re

import pymupdf


UNKNOWN = "Not recorded"


def text(value):
    if value is None or not str(value).strip():
        return UNKNOWN
    # Every stored value is plain text, never executable markup or a resource URL.
    # Break long filenames/identifiers without dropping characters or widening tables.
    value = re.sub(r"(\S{40})(?=\S)", lambda match: match[1] + "\u200b", str(value))
    return escape(value).replace("\n", "<br/>")


def label(value):
    return str(value).replace("_", " ").capitalize() if value else UNKNOWN


def date_label(value):
    if not value:
        return UNKNOWN
    try:
        return date.fromisoformat(str(value)).strftime("%d %b %Y").lstrip("0")
    except ValueError:
        return f"Unrecognized date: {value}"


def duration(value, unit):
    if value is None:
        return UNKNOWN
    return f"{value} {label(unit).lower()}" if unit else f"{value} (unit not recorded)"


def timestamp_label(value):
    if not value:
        return UNKNOWN
    try:
        timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            return str(value)  # Do not invent a timezone for legacy values.
        return timestamp.astimezone(timezone.utc).strftime("%d %b %Y, %H:%M UTC").lstrip("0")
    except ValueError:
        return str(value)


def value_label(contract):
    value = contract.get("contract_value")
    if value is None:
        return UNKNOWN
    try:
        amount = Decimal(str(value))
        if not amount.is_finite():
            return UNKNOWN
        return f"{contract.get('currency') or 'Currency not recorded'} {amount:,.2f}"
    except InvalidOperation:
        return UNKNOWN


def rows(items):
    return "<table>" + "".join(
        f"<tr><th>{text(key)}</th><td>{text(value)}</td></tr>" for key, value in items
    ) + "</table>"


def paragraph(title, value):
    return f"<h3>{text(title)}</h3><p>{text(value)}</p>"


def bullets(values):
    values = values if isinstance(values, list) else []
    return ("<ul>" + "".join(f"<li>{text(value)}</li>" for value in values) + "</ul>"
            if values else f"<p>{UNKNOWN}</p>")


def build_contract_summary(contract: dict, reminders: list[dict], *, generated_at=None, commercial_review=None) -> bytes:
    """Render an allowlisted snapshot; never serialize the entire database row."""
    now = generated_at or datetime.now(timezone.utc)
    today = now.astimezone(timezone.utc).date()
    deadline = contract.get("cancellation_deadline")
    countdown = UNKNOWN
    if deadline:
        try:
            days = (date.fromisoformat(str(deadline)) - today).days
            countdown = (f"{days} calendar days remaining" if days > 0 else
                         "Due today" if days == 0 else
                         f"{abs(days)} calendar {'day' if days == -1 else 'days'} past the saved deadline; review the renewal cycle")
        except ValueError:
            pass

    notice_value = contract.get("notice_period_value")
    notice_unit = contract.get("notice_period_unit")
    if notice_value is None and contract.get("notice_period_days") is not None:
        notice_value, notice_unit = contract["notice_period_days"], "calendar days"
    if notice_unit == "days":
        notice_unit = "calendar days"
    auto_renewal = contract.get("auto_renewal")
    confidence = contract.get("ai_confidence")
    confidence_label = (f"{confidence:.0%}" if isinstance(confidence, (int, float))
                        and not isinstance(confidence, bool) and 0 <= confidence <= 1 else UNKNOWN)
    has_insight = any(contract.get(key) for key in (
        "ai_action", "ai_summary", "ai_key_findings", "ai_commercial_flags"
    ))
    ai_state = contract.get("ai_analysis_status")
    html = f"""<html><body>
      <p class="eyebrow">RENEWAI / CONTRACT SUMMARY</p>
      <h1>{text(contract.get('vendor_name') or 'Contract summary')}</h1>
      <p class="subtitle">{text(contract.get('contract_title'))}</p>
      <p class="stamp">Generated {text(now.astimezone(timezone.utc).strftime('%d %b %Y, %H:%M UTC'))}</p>
      <div class="callout"><b>Renewal date:</b> {text(date_label(contract.get('effective_renewal_date')))}<br/>
      <b>Cancel / give non-renewal notice by:</b> {text(date_label(deadline))}<br/>
      {text(countdown)}</div>
      <p class="muted">A snapshot of saved, human-reviewed terms and renewal calculations.
      Unknown details are marked "Not recorded". Review the original agreement before acting.</p>
      <h2>1. Agreement at a glance</h2>
      {rows([
          ('Provider / vendor', contract.get('vendor_name')),
          ('Customer / other contracting party', contract.get('customer_name')),
          ('Agreement', contract.get('contract_title')),
          ('Tracked contract value', value_label(contract)),
          ('Renewal structure', label(contract.get('renewal_structure'))),
          ('Automatic renewal', 'Yes' if auto_renewal is True else 'No' if auto_renewal is False else UNKNOWN),
          ('Record status', 'Archived' if contract.get('archived') is True else 'Active' if contract.get('archived') is False else UNKNOWN),
          ('Saved timing risk', label(contract.get('risk_level'))),
      ])}
      {paragraph('Saved renewal guidance', contract.get('recommendation'))}
      <h2>2. Dates and notice requirements</h2>
      {rows([
          ('Reviewed start date', date_label(contract.get('start_date'))),
          ('Reviewed end date', date_label(contract.get('end_date'))),
          ('Reviewed renewal date', date_label(contract.get('renewal_date'))),
          ('Initial term', duration(contract.get('initial_term_months'), 'months')),
          ('Renewal term', duration(contract.get('renewal_term_months'), 'months')),
          ('Effective start date', date_label(contract.get('effective_start_date'))),
          ('Effective end date', date_label(contract.get('effective_end_date'))),
          ('Actionable renewal date (saved)', date_label(contract.get('effective_renewal_date'))),
          ('Non-renewal / cancellation deadline (saved)', date_label(deadline)),
          ('Time to saved deadline at export', countdown),
          ('Required notice', duration(notice_value, notice_unit)),
          ('Notice measured before', label(contract.get('notice_period_anchor'))),
          ('Notice window start requirement', duration(contract.get('notice_window_start_value'), contract.get('notice_window_start_unit'))),
          ('Notice window end requirement', duration(contract.get('notice_window_end_value'), contract.get('notice_window_end_unit'))),
          ('Notice window opens (saved)', date_label(contract.get('notice_window_open_date'))),
          ('Notice window closes (saved)', date_label(contract.get('notice_window_close_date'))),
      ])}
      <p class="muted">Reviewed dates preserve the source inputs; effective dates describe the saved renewal cycle.
      This export does not recalculate the cycle. If the saved deadline has passed, review the current renewal position.
      A missing business-day calendar can limit deadline precision; check the notice clause.</p>
      <h2>3. Important contract terms and evidence</h2>
      <p class="muted">Saved clause text is reproduced below. Verified PDF page citations appear in the commercial review section when available.</p>
      {paragraph('Renewal conditions', contract.get('renewal_clause'))}
      {paragraph('Termination rights and breach cure', contract.get('termination_clause'))}
      {paragraph('Payment terms and billing frequency', contract.get('payment_terms'))}
      {paragraph('Renewal pricing and increases', contract.get('pricing_clause'))}
      {paragraph('Minimum commitments and licenses', contract.get('minimum_commitment'))}
      {paragraph('Refund restrictions', contract.get('refund_clause'))}
      <h2>4. AI renewal insight - advisory</h2>
      <p class="muted">AI recommendations are separate from the organization's decision.
      They are based on saved inputs and may be incomplete. Exporting does not generate or refresh AI analysis.</p>
      {rows([
          ('Analysis status', label(ai_state or ('completed' if has_insight else 'not available'))),
          ('AI suggested action', label(contract.get('ai_action'))),
          ('AI confidence (not a guarantee of accuracy)', confidence_label),
      ])}
      {paragraph('AI summary', contract.get('ai_summary') or ('AI insight is unavailable; the reviewed contract remains saved.' if ai_state == 'failed' else 'No AI summary is recorded.'))}
      <h3>Key findings</h3>{bullets(contract.get('ai_key_findings'))}
      <h3>Commercial risks and flags</h3>{bullets(contract.get('ai_commercial_flags'))}
      <h2>5. Organization's recorded decision</h2>
      {rows([
          ('Renewal decision', label(contract.get('renewal_decision'))),
          ('Workflow status', label(contract.get('renewal_status'))),
          ('Decision last updated', timestamp_label(contract.get('decision_updated_at'))),
      ])}
      <p class="muted">Internal decision notes, owner, and decision history are excluded from this shareable summary.</p>
      <h2>6. Reminder schedule</h2>
      <p class="muted">Saved, non-cancelled reminders at export time. Pending does not mean delivered.
      Downloading this summary does not send any reminder.</p>
    """
    if reminders:
        html += '<table class="reminders"><tr><th>Checkpoint</th><th>Scheduled date</th><th>Status</th></tr>'
        for reminder in reminders:
            html += '<tr>' + ''.join(f'<td>{text(value)}</td>' for value in (
                label(reminder.get('reminder_type')), date_label(reminder.get('remind_on')),
                label(reminder.get('status')),
            )) + '</tr>'
        html += '</table>'
    else:
        html += '<p>No non-cancelled reminders are recorded.</p>'
    if commercial_review:
        html += '<div class="commercial-review"><h2>Commercial risk review — advisory</h2>'
        html += paragraph('Review coverage', commercial_review['coverage'])
        html += '<p>Severity not assessed. These are review prompts, not findings of legal invalidity or a complete risk assessment.</p>'
        for item in commercial_review['items']:
            review = item.get('review')
            html += paragraph(item['title'], (review['status'] if review else 'Unreviewed') + ' — ' + item['explanation'])
            for citation in item['citations']:
                html += paragraph('PDF page ' + str(citation['page']), citation['quote'])
        html += '<p>Internal review reasons and reviewer identities are excluded. Confirmation does not approve the agreement.</p></div>'
    html += f"""<h2>7. Source and snapshot</h2>
      {rows([
          ('Original filename', contract.get('filename')),
          ('Record saved at', timestamp_label(contract.get('created_at'))),
          ('Contract reference', contract.get('id')),
      ])}
      <p class="muted">This summary includes the important information stored in RenewAI, not every provision
      of the original agreement. The customer name, additional obligations, amendments, or other terms may be
      absent if they were not captured. The original signed agreement and applicable amendments govern.</p>
      </body></html>"""

    css = """
      body { font-family: sans-serif; font-size: 9.5pt; line-height: 1.35; color: #172033; }
      h1 { font-size: 23pt; line-height: 1.15; margin: 8pt 0; color: #101b36; }
      h2 { font-size: 13pt; margin: 16pt 0 7pt; color: #2445a0; page-break-after: avoid; }
      h3 { font-size: 10pt; margin: 10pt 0 4pt; page-break-after: avoid; }
      p { margin: 4pt 0 7pt; } li { margin: 4pt 0; }
      .eyebrow { font-size: 9pt; letter-spacing: 1pt; color: #2445a0; }
      .subtitle { font-size: 12pt; color: #475569; }
      .stamp, .muted { font-size: 8.5pt; color: #526075; }
      .callout { color: #2445a0; padding: 12pt 0; margin: 14pt 0; }
      table { width: 100%; border-collapse: collapse; }
      tr { page-break-inside: avoid; }
      th, td { text-align: left; vertical-align: top; padding: 5pt 8pt; border-bottom: 0.5pt solid #dce3ec; }
      th { width: 170pt; font-size: 9pt; }
      td { width: 280pt; font-size: 9pt; }
      .reminders th, .reminders td { width: 145pt; }
      p { orphans: 2; widows: 2; }
      .commercial-review h3 { margin: 5pt 0 2pt; }
      .commercial-review p { margin: 3pt 0 4pt; }
    """
    output = BytesIO()
    page = pymupdf.paper_rect("a4")
    story = pymupdf.Story(html=html, user_css=css)
    writer = pymupdf.DocumentWriter(output)
    try:
        story.write(writer, lambda _number, _filled: (page, page + (44, 48, -44, -48), None))
    finally:
        writer.close()
    with pymupdf.open(stream=output.getvalue(), filetype="pdf") as document:
        for index, pdf_page in enumerate(document):
            pdf_page.wrap_contents()
            pdf_page.insert_text((44, 28), "RENEWAI  |  Contract summary", fontsize=8, color=(0.32, 0.38, 0.46))
            pdf_page.insert_text((44, page.height - 27), f"Generated {today.isoformat()} UTC  |  Page {index + 1} of {len(document)}",
                                 fontsize=8, color=(0.32, 0.38, 0.46))
        document.set_metadata({"title": "RenewAI contract summary", "author": "RenewAI"})
        return document.tobytes(garbage=4, deflate=True)


def summary_filename(contract):
    # ASCII, bounded, and free of path/header characters; original data stays inside the PDF.
    vendor = re.sub(r"[^a-zA-Z0-9]+", "-", str(contract.get("vendor_name") or "contract")).strip("-")[:64]
    return f"RenewAI-{vendor or 'contract'}-summary.pdf"
