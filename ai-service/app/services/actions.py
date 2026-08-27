"""Side-effect tools: PDF export and trip reminder email."""

from __future__ import annotations

import json
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from fpdf import FPDF

from app.config import settings
from app.services.db import fetch_all, fetch_one

_EXPORTS_DIR = Path(__file__).resolve().parent.parent.parent / "exports"
_EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _load_trip(trip_id: str) -> dict[str, Any]:
    tid = (trip_id or "").strip()
    if not tid:
        raise ValueError("trip_id is required")
    row = fetch_one(
        """
        SELECT t.id, t.name, t.description, t."startDate", t."endDate", t."maxBudget",
               t.itinerary, t.expenses, t."userId",
               u.email AS user_email, u."firstName" AS user_first_name, u.username
        FROM "Trip" t
        INNER JOIN "User" u ON u.id = t."userId"
        WHERE t.id = %s
        """,
        [tid],
    )
    if not row:
        raise ValueError(f"Trip not found: {trip_id}")
    stops = fetch_all(
        """
        SELECT c.name, c.country
        FROM "TripStop" ts
        INNER JOIN "City" c ON c.id = ts."cityId"
        WHERE ts."tripId" = %s
        ORDER BY ts.sequence NULLS LAST, ts."createdAt"
        """,
        [tid],
    )
    data = dict(row)
    data["stops"] = stops
    return data


def _parse_itinerary(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [x for x in parsed if isinstance(x, dict)]
        if isinstance(parsed, dict):
            days = parsed.get("itinerary") or parsed.get("days") or []
            return [x for x in days if isinstance(x, dict)]
    return []


def export_trip_pdf(trip_id: str) -> dict[str, Any]:
    """
    Generate a simple PDF itinerary and return a local download path + URL.

    Files land in ai-service/exports/ and are served at GET /exports/{filename}.
    """
    trip = _load_trip(trip_id)
    days = _parse_itinerary(trip.get("itinerary"))
    dest = ", ".join(
        f"{s['name']}, {s['country']}" for s in (trip.get("stops") or []) if s.get("name")
    ) or "Destination TBD"

    start = trip.get("startDate")
    end = trip.get("endDate")
    start_s = start.date().isoformat() if hasattr(start, "date") else str(start)[:10]
    end_s = end.date().isoformat() if hasattr(end, "date") else str(end)[:10]

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_margins(15, 15, 15)

    def write_line(text: str, *, bold: bool = False, size: int = 11, h: float = 6) -> None:
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "B" if bold else "", size)
        safe = str(text).encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(pdf.epw, h, safe)

    write_line(f"GlobeTrotter Itinerary: {trip.get('name') or 'Trip'}", bold=True, size=16, h=9)
    write_line(f"Destination: {dest}")
    write_line(f"Dates: {start_s} to {end_s}")
    write_line(f"Max budget: ${trip.get('maxBudget') or 0}")
    if trip.get("description"):
        write_line(f"Notes: {trip['description']}")

    pdf.ln(3)
    write_line("Day-by-day plan", bold=True, size=13, h=8)

    if not days:
        write_line("No itinerary sections stored for this trip yet.")
    else:
        for i, day in enumerate(days, start=1):
            title = str(day.get("title") or f"Day {i}")
            desc = str(day.get("description") or "")
            budget = str(day.get("budget") or "")
            pdf.ln(2)
            write_line(title, bold=True, size=12)
            if budget:
                write_line(f"Budget: {budget}", size=10, h=5)
            if desc:
                write_line(desc, size=10, h=5)

    filename = f"trip-{trip_id[:8]}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.pdf"
    path = _EXPORTS_DIR / filename
    pdf.output(str(path))

    base = settings.public_ai_base_url.rstrip("/")
    url = f"{base}/exports/{filename}"
    return {
        "trip_id": trip_id,
        "trip_name": trip.get("name"),
        "filename": filename,
        "path": str(path.resolve()),
        "download_url": url,
        "days_exported": len(days),
    }


def send_trip_reminder_email(trip_id: str, dry_run: bool = False) -> dict[str, Any]:
    """
    Email the trip owner a reminder (SMTP settings shared with Node Nodemailer).

    If SMTP is not configured, returns a dry-run payload instead of failing hard
    unless dry_run=False and credentials are missing.
    """
    trip = _load_trip(trip_id)
    to_email = (trip.get("user_email") or "").strip()
    if not to_email:
        raise ValueError("Trip owner has no email address")

    start = trip.get("startDate")
    start_s = start.date().isoformat() if hasattr(start, "date") else str(start)[:10]
    end = trip.get("endDate")
    end_s = end.date().isoformat() if hasattr(end, "date") else str(end)[:10]
    link = f"{settings.frontend_base_url.rstrip('/')}/itinerary/{trip_id}"
    first = trip.get("user_first_name") or trip.get("username") or "traveler"

    subject = f"Reminder: {trip.get('name') or 'your trip'} starts {start_s}"
    text = (
        f"Hi {first},\n\n"
        f"This is a reminder for your GlobeTrotter trip \"{trip.get('name')}\".\n"
        f"Dates: {start_s} to {end_s}\n"
        f"Budget: ${trip.get('maxBudget') or 0}\n\n"
        f"View itinerary: {link}\n\n"
        f"— GlobeTrotter\n"
    )
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Trip reminder</h2>
      <p>Hi {first},</p>
      <p>Your trip <strong>{trip.get('name')}</strong> is coming up.</p>
      <p>Dates: {start_s} → {end_s}<br/>Budget: ${trip.get('maxBudget') or 0}</p>
      <p><a href="{link}">Open itinerary</a></p>
      <p style="color:#777;font-size:12px;">GlobeTrotter</p>
    </div>
    """

    smtp_ready = bool(settings.smtp_host and settings.smtp_user and settings.smtp_pass)
    if dry_run or not smtp_ready:
        return {
            "trip_id": trip_id,
            "to": to_email,
            "subject": subject,
            "sent": False,
            "dry_run": True,
            "reason": "dry_run=True" if dry_run else "SMTP not configured (SMTP_HOST/USER/PASS)",
            "preview_text": text,
            "itinerary_link": link,
        }

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"GlobeTrotter <{settings.smtp_user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_pass)
        server.sendmail(settings.smtp_user, [to_email], msg.as_string())

    return {
        "trip_id": trip_id,
        "to": to_email,
        "subject": subject,
        "sent": True,
        "dry_run": False,
        "itinerary_link": link,
    }
