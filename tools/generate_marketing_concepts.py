"""Generate synthetic, explicitly illustrative Meta Clinic feature visuals.

These are static marketing concepts. They do not read patient or application data.
"""

from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "apps/web/public/marketing"
OUT.mkdir(parents=True, exist_ok=True)

# Each row is independently invented for this development-only marketing set.
SCREENS = {
    "tracking-board": ("Tracking Board", ["Room", "Patient", "Stage", "Visit reason", "Vitals", "Care tasks", "Provider", "Timing"], [
        ["MAIN-1", "Avery Ellis", "Expected", "Annual wellness", "—", "Forms complete", "Morgan Ellis, MD", "8:40 AM"],
        ["MAIN-2", "Jordan Vale", "Intake", "New patient consult", "BP 118/74", "History review", "Alex Rowan, NP", "9:05 AM"],
        ["MAIN-3", "Taylor Reed", "Ready for provider", "Follow-up", "BP 122/78", "Vitals recorded", "Riley Chen, DO", "9:15 AM"],
        ["MAIN-4", "Quinn Harper", "Provider assigned", "Results review", "HR 68 · 70 kg", "Lab discussion", "Morgan Ellis, MD", "9:30 AM"],
        ["ANNEX-1", "Casey Rowan", "Checkout", "Same-day visit", "BP 120/76", "Summary ready", "Alex Rowan, NP", "10:10 AM"],
        ["TELE-1", "Riley Stone", "Ready for provider", "Virtual follow-up", "Self reported", "Room link ready", "Riley Chen, DO", "10:30 AM"],
        ["MAIN-5", "Morgan Juniper", "Waiting room", "Medication review", "—", "Arrival recorded", "Morgan Ellis, MD", "10:45 AM"],
    ]),
    "intake-forms": ("Intake & Forms", ["Patient", "Visit", "Form", "Received", "Review state"], [
        ["Avery Ellis", "Annual wellness", "Health history", "Sep 23 · 4:12 PM", "Ready to review"],
        ["Jordan Vale", "New patient", "Medication list", "Sep 23 · 5:40 PM", "Reviewed"],
        ["Taylor Reed", "Follow-up", "Interval update", "Sep 24 · 7:18 AM", "Ready to review"],
        ["Quinn Harper", "Results review", "Symptom update", "Sep 23 · 6:02 PM", "Reviewed"],
        ["Riley Stone", "Virtual follow-up", "Visit questions", "Sep 24 · 8:08 AM", "Ready to review"],
        ["Casey Rowan", "Same-day visit", "Medical history", "Sep 24 · 8:22 AM", "Submitted"],
    ]),
    "team-workspace": ("Team Workspace", ["Task", "Patient / context", "Owner", "Due", "State"], [
        ["Prepare room", "Avery Ellis · wellness", "Drew Carter", "8:30 AM", "Complete"],
        ["Review intake", "Jordan Vale · new patient", "Alex Rowan, NP", "9:00 AM", "In progress"],
        ["Check result", "Quinn Harper · lab review", "Riley Chen, DO", "9:45 AM", "Assigned"],
        ["Send visit summary", "Casey Rowan · same-day", "Drew Carter", "11:30 AM", "Ready"],
        ["Confirm follow-up", "Taylor Reed · follow-up", "Morgan Ellis, MD", "12:00 PM", "Assigned"],
        ["Prepare virtual room", "Riley Stone · video", "Sam Patel", "10:20 AM", "Complete"],
    ]),
    "labs-results": ("Labs & Results", ["Patient", "Test", "Collected", "Result", "Review state"], [
        ["Quinn Harper", "Basic metabolic panel", "Sep 22", "Received Sep 23", "Reviewed"],
        ["Taylor Reed", "Lipid panel", "Sep 22", "Received Sep 24", "Ready to review"],
        ["Avery Ellis", "Complete blood count", "Sep 23", "Received Sep 24", "Ready to review"],
        ["Jordan Vale", "TSH", "Sep 21", "Received Sep 22", "Reviewed"],
        ["Casey Rowan", "A1c", "Sep 24", "In progress", "Awaiting result"],
        ["Riley Stone", "Vitamin B12", "Sep 23", "Received Sep 24", "Ready to review"],
    ]),
    "medication-workflows": ("Medication Workflows", ["Patient", "Therapy", "Route", "Prepared", "Local state"], [
        ["Jordan Vale", "Metformin 500 mg", "Clinic review", "Sep 24 · 9:20", "Awaiting clinician"],
        ["Taylor Reed", "Lisinopril 10 mg", "Local record", "Sep 24 · 9:35", "Reviewed"],
        ["Quinn Harper", "Atorvastatin 20 mg", "Clinic review", "Sep 24 · 10:05", "Ready to review"],
        ["Avery Ellis", "Vitamin D 1000 IU", "Local record", "Sep 23 · 4:20", "Documented"],
        ["Casey Rowan", "Albuterol inhaler", "Clinic review", "Sep 24 · 11:10", "Awaiting clinician"],
        ["Riley Stone", "Levothyroxine 50 mcg", "Local record", "Sep 24 · 8:30", "Reviewed"],
    ]),
    "care-plans": ("Care Plans", ["Patient", "Goal", "Next service", "Target", "Progress"], [
        ["Taylor Reed", "Improve mobility", "PT follow-up", "Oct 2", "2 of 6 visits"],
        ["Quinn Harper", "Review lab trend", "Results visit", "Sep 30", "Review booked"],
        ["Jordan Vale", "Establish baseline", "New patient visit", "Sep 24", "In progress"],
        ["Avery Ellis", "Preventive care", "Annual wellness", "Sep 24", "Visit today"],
        ["Riley Stone", "Monitor symptoms", "Virtual follow-up", "Oct 8", "Follow-up set"],
        ["Casey Rowan", "Recovery plan", "Check-in", "Sep 29", "Task assigned"],
    ]),
    "cash-billing": ("Cash Billing", ["Patient", "Service", "Charge", "Paid", "Balance"], [
        ["Avery Ellis", "Annual wellness", "$145.00", "$145.00", "$0.00"],
        ["Jordan Vale", "New patient consult", "$195.00", "$75.00", "$120.00"],
        ["Taylor Reed", "Follow-up", "$95.00", "$95.00", "$0.00"],
        ["Quinn Harper", "Results review", "$85.00", "$0.00", "$85.00"],
        ["Casey Rowan", "Same-day visit", "$125.00", "$125.00", "$0.00"],
        ["Riley Stone", "Virtual follow-up", "$90.00", "$90.00", "$0.00"],
    ]),
    "memberships-packages": ("Memberships & Packages", ["Member", "Offer", "Cycle", "Included use", "State"], [
        ["Avery Ellis", "Care Plus", "Oct 1 renewal", "2 of 4 visits", "Active"],
        ["Taylor Reed", "Mobility 6", "Sep–Dec 2026", "2 of 6 visits", "Active"],
        ["Quinn Harper", "Care Plus", "Oct 12 renewal", "1 of 4 visits", "Active"],
        ["Jordan Vale", "New patient bundle", "Sep–Nov 2026", "1 of 3 visits", "Active"],
        ["Riley Stone", "Virtual care", "Oct 5 renewal", "2 of 3 visits", "Active"],
        ["Casey Rowan", "Wellness 4", "Sep–Dec 2026", "3 of 4 visits", "Active"],
    ]),
    "invoices": ("Invoices", ["Invoice", "Patient", "Service", "Total", "State"], [
        ["MC-1048", "Avery Ellis", "Annual wellness", "$145.00", "Paid"],
        ["MC-1049", "Jordan Vale", "New patient consult", "$195.00", "Partially paid"],
        ["MC-1050", "Taylor Reed", "Follow-up", "$95.00", "Paid"],
        ["MC-1051", "Quinn Harper", "Results review", "$85.00", "Sent"],
        ["MC-1052", "Casey Rowan", "Same-day visit", "$125.00", "Paid"],
        ["MC-1053", "Riley Stone", "Virtual follow-up", "$90.00", "Draft"],
    ]),
    "optional-insurance": ("Optional Insurance", ["Patient", "Visit", "Coverage record", "Local work", "State"], [
        ["Avery Ellis", "Annual wellness", "Pine Health · PPO", "Eligibility reviewed", "Prepared locally"],
        ["Jordan Vale", "New patient", "Lakeview Plan", "Coverage captured", "Review needed"],
        ["Taylor Reed", "Follow-up", "Pine Health · PPO", "Service mapped", "Prepared locally"],
        ["Quinn Harper", "Results review", "Westfield Plan", "Coding review", "In progress"],
        ["Casey Rowan", "Same-day visit", "Lakeview Plan", "Coverage captured", "Review needed"],
        ["Riley Stone", "Virtual follow-up", "Westfield Plan", "Service mapped", "Prepared locally"],
    ]),
    "online-requests": ("Online Requests", ["Requested by", "Service", "Preferred time", "Received", "Review state"], [
        ["Avery Ellis", "Annual wellness", "Thu morning", "Sep 23 · 5:12 PM", "Ready to review"],
        ["Jordan Vale", "New patient consult", "Fri afternoon", "Sep 23 · 6:40 PM", "Assigned"],
        ["Taylor Reed", "Follow-up", "Next week", "Sep 24 · 7:18 AM", "Reviewed"],
        ["Quinn Harper", "Results discussion", "Thu afternoon", "Sep 24 · 8:02 AM", "Ready to review"],
        ["Riley Stone", "Virtual follow-up", "Fri morning", "Sep 24 · 8:08 AM", "Assigned"],
        ["Casey Rowan", "Same-day consult", "Today", "Sep 24 · 8:22 AM", "Reviewed"],
    ]),
    "patient-portal": ("Patient Portal", ["Item", "Date", "Location / format", "Status", "Next action"], [
        ["Annual wellness", "Sep 24 · 8:40 AM", "Main clinic", "Confirmed", "View visit"],
        ["Health history", "Sep 23 · 4:12 PM", "Online form", "Submitted", "View answers"],
        ["Results review", "Oct 2 · 9:30 AM", "Virtual visit", "Confirmed", "Visit details"],
        ["Care plan summary", "Sep 22", "Shared document", "Available", "Open"],
        ["Medication list", "Sep 22", "Shared record", "Available", "Open"],
        ["Follow-up questions", "Oct 1", "Online form", "Ready", "Complete"],
    ]),
    "reminders": ("Reminders", ["Patient", "Related visit", "Channel", "Scheduled", "Outcome"], [
        ["Avery Ellis", "Annual wellness", "Text", "Sep 23 · 8:40 AM", "Sent"],
        ["Jordan Vale", "New patient", "Email", "Sep 23 · 9:00 AM", "Sent"],
        ["Taylor Reed", "Follow-up", "Text", "Sep 24 · 8:00 AM", "Scheduled"],
        ["Quinn Harper", "Results review", "Email", "Sep 24 · 9:00 AM", "Scheduled"],
        ["Riley Stone", "Virtual follow-up", "Text", "Sep 24 · 9:30 AM", "Sent"],
        ["Casey Rowan", "Same-day visit", "Email", "Sep 24 · 10:00 AM", "Prepared"],
    ]),
    "telehealth": ("Telehealth", ["Virtual room", "Patient", "Visit", "Provider", "Start", "Action"], [
        ["Telehealth 1", "Riley Stone", "Follow-up", "Riley Chen, DO", "9:30 AM", "Enter room"],
        ["Telehealth 2", "Quinn Harper", "Results review", "Morgan Ellis, MD", "10:00 AM", "Enter room"],
        ["Telehealth 1", "Avery Ellis", "Care review", "Alex Rowan, NP", "11:15 AM", "Room ready"],
        ["Telehealth 2", "Taylor Reed", "Progress check", "Riley Chen, DO", "1:00 PM", "Room ready"],
        ["Telehealth 1", "Jordan Vale", "New patient", "Morgan Ellis, MD", "2:30 PM", "Scheduled"],
        ["Telehealth 2", "Casey Rowan", "Follow-up", "Alex Rowan, NP", "3:15 PM", "Scheduled"],
    ]),
}

METRICS = {
    "intake-forms": [("Forms in view", "6"), ("Reviewed", "2"), ("To review", "3")],
    "team-workspace": [("Team tasks", "6"), ("Complete", "2"), ("Assigned", "2")],
    "labs-results": [("Lab records", "6"), ("Reviewed", "2"), ("To review", "3")],
    "medication-workflows": [("Local records", "6"), ("Reviewed", "2"), ("Clinician review", "2")],
    "care-plans": [("Care plans", "6"), ("Visits today", "2"), ("Follow-ups", "3")],
    "cash-billing": [("Checkout records", "6"), ("Paid in full", "4"), ("Open balances", "2")],
    "memberships-packages": [("Active offers", "6"), ("Renewing in Oct", "3"), ("Package plans", "3")],
    "invoices": [("Invoices", "6"), ("Paid", "3"), ("Open / draft", "3")],
    "optional-insurance": [("Local records", "6"), ("Prepared locally", "3"), ("To review", "2")],
    "online-requests": [("Requests", "6"), ("Reviewed", "2"), ("Ready to review", "2")],
    "patient-portal": [("Available items", "6"), ("Upcoming visits", "2"), ("Forms", "2")],
    "reminders": [("Reminder records", "6"), ("Sent", "3"), ("Scheduled", "2")],
    "telehealth": [("Virtual visits", "6"), ("Enter room", "2"), ("Room ready", "2")],
}


def text(x, y, value, size=15, weight=400, fill="#20364f", anchor="start"):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-family="Segoe UI, Arial, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{escape(value)}</text>'


def rect(x, y, w, h, fill, rx=0, stroke="none"):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}"/>'


def base(title, subtitle):
    p = ['<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="850" viewBox="0 0 1400 850" role="img">', rect(0, 0, 1400, 850, "#f7f9fd"), rect(0, 0, 176, 850, "#17344c")]
    p += [text(25, 41, "Meta Clinic", 21, 700, "#f9fbfd"), rect(23, 57, 128, 1, "#587084")]
    for i, item in enumerate(["Overview", "Schedule", "Tracking Board", "Patients", "Care", "Operations", "Billing", "Messages"]):
        y = 99 + i * 48
        active = item.lower().split()[0] in title.lower() or (title in ["Intake & Forms", "Labs & Results", "Care Plans", "Medication Workflows"] and item == "Care")
        if active: p.append(rect(13, y - 24, 150, 36, "#e9f1ff", 5))
        p.append(text(28, y, item, 13, 650 if active else 450, "#183c5e" if active else "#ccdae5"))
    p += [rect(176, 0, 1224, 62, "#ffffff"), text(205, 39, "Main clinic  /  September 24, 2026", 13, 500, "#59708a"), text(1365, 39, "MC", 14, 700, "#2b527e", "end")]
    p += [text(210, 112, title, 31, 700), text(210, 141, subtitle, 14, 400, "#5c7089")]
    p += [rect(1130, 85, 225, 43, "#1d56b4", 6), text(1242, 112, "Open workspace  →", 14, 650, "#ffffff", "middle")]
    p += [rect(211, 802, 1155, 1, "#d9e4ef"), text(211, 825, "ILLUSTRATIVE CONCEPT  ·  FICTIONAL RECORDS  ·  DEFAULT CLINIC THEME", 11, 700, "#68809b")]
    return p


def overview(slug, title, headers, rows):
    p = base(title, "Clinic workspace  ·  Active day overview")
    if slug == "tracking-board":
        for i, (label, number) in enumerate([("All visits", "7"), ("Expected", "1"), ("In care", "3"), ("Checkout", "1")]):
            x = 211 + i * 285
            p += [rect(x, 169, 264, 77, "#ffffff", 7, "#ccdaec"), text(x+17, 195, label, 12, 600, "#5d718b"), text(x+17, 229, number, 27, 700, "#20364f")]
        top, row_h = 272, 66
    else:
        for i, (label, number) in enumerate(METRICS[slug]):
            x = 211 + i * 380
            p += [rect(x, 169, 360, 77, "#ffffff", 7, "#ccdaec"), text(x+17, 195, label, 12, 600, "#5d718b"), text(x+17, 229, number, 27, 700, "#20364f")]
        top, row_h = 278, 66
    p.append(rect(211, top, 1155, row_h * (len(rows)+1)+2, "#ffffff", 8, "#c7d7ef"))
    p.append(rect(212, top+1, 1153, row_h, "#e6efff", 7))
    widths = [110, 150, 145, 170, 160, 175, 145, 100] if slug == "tracking-board" else [int(1130 / len(headers))] * len(headers)
    xs = [225]
    for width in widths[:-1]: xs.append(xs[-1]+width)
    for x, h in zip(xs, headers): p.append(text(x, top+39, h, 13, 700))
    for ri, row in enumerate(rows):
        y = top + row_h*(ri+1)
        if ri % 2: p.append(rect(213, y, 1151, row_h, "#f5f8fd"))
        p.append(rect(211, y, 1155, 1, "#dce7f6"))
        for ci, (x, cell) in enumerate(zip(xs, row)):
            value = cell if len(cell) < (22 if slug == "tracking-board" else 31) else cell[:19] + "…"
            if slug == "tracking-board" and ci == 2:
                p.append(rect(x-5, y+15, min(widths[ci]-8, 131), 30, "#e5eefc", 14))
            p.append(text(x, y+38, value, 12 if slug == "tracking-board" else 14, 650 if ci == 1 else 450, "#1e4069" if ci in (1,2) else "#334c66"))
    p.append('</svg>')
    (OUT / f"{slug}-overview.svg").write_text("".join(p), encoding="utf-8")


def detail(slug, title, headers, rows):
    p = base(title, "Record detail  ·  Review the next action in context")
    name = rows[0][0] if slug not in ["tracking-board", "invoices", "patient-portal"] else ("Avery Ellis" if slug != "invoices" else "MC-1048")
    p += [rect(211, 172, 730, 580, "#ffffff", 9, "#c8d8ed"), rect(968, 172, 397, 580, "#ffffff", 9, "#c8d8ed")]
    p += [text(240, 215, "RECORD / 024", 12, 700, "#5777a4"), text(240, 258, name, 28, 700), text(240, 287, f"{title} · September 24, 2026", 14, 400, "#637891")]
    p += [rect(240, 316, 670, 1, "#d9e4f0"), text(240, 354, "Current details", 18, 700)]
    for i in range(4):
        y = 391 + i*74
        p += [rect(240, y-23, 670, 66, "#f4f8ff" if i%2==0 else "#ffffff", 5)]
        p.append(text(255, y, headers[min(i+1,len(headers)-1)], 12, 700, "#60758c"))
        p.append(text(255, y+24, rows[0][min(i+1,len(rows[0])-1)], 15, 600, "#213e61"))
        p.append(text(887, y+20, "✓", 18, 700, "#356c47", "end"))
    p += [text(996, 215, "WORKFLOW", 12, 700, "#5777a4"), text(996, 253, "Today's path", 21, 700)]
    steps = ["Record opened", "Details reviewed", "Next action ready", "Follow-up visible"]
    for i, step in enumerate(steps):
        y = 315 + i*94
        p += [rect(996, y-20, 26, 26, "#e4f0e7", 13), text(1009, y-1, str(i+1), 12, 700, "#2d6741", "middle"), text(1038, y, step, 15, 650)]
        p.append(text(1038, y+23, ["Sep 24 · 8:40 AM", "Sep 24 · 9:05 AM", "Sep 24 · 9:18 AM", "Sep 24 · 9:30 AM"][i], 12, 400, "#6a7f96"))
    p += [rect(996, 677, 342, 46, "#1d56b4", 6), text(1167, 706, "View next step  →", 14, 650, "#ffffff", "middle"), '</svg>']
    (OUT / f"{slug}-detail.svg").write_text("".join(p), encoding="utf-8")


def tracking_flow(title, rows):
    p = base(title, "Patient flow  ·  Fictional Thursday clinic day")
    stages = ["Expected", "Intake", "Ready for provider", "Provider assigned", "Checkout"]
    groups = [[rows[0]], [rows[1]], [rows[2], rows[5]], [rows[3], rows[6]], [rows[4]]]
    for i, (stage, group) in enumerate(zip(stages, groups)):
        x = 210 + i*233
        p += [rect(x, 183, 217, 555, "#ffffff", 8, "#c8d8ed"), text(x+14, 216, stage, 14, 700), text(x+196, 216, str(len(group)), 14, 700, "#2359a2", "end")]
        for j, row in enumerate(group):
            y = 242+j*185
            p += [rect(x+12, y, 193, 166, "#f3f7fd", 6, "#d4e1f1"), text(x+23, y+27, row[1], 15, 700), text(x+23, y+50, row[0]+" · "+row[7], 12, 500, "#58718d"), text(x+23, y+78, row[3][:23], 13, 600), text(x+23, y+105, row[4][:23], 12, 450, "#536b84"), text(x+23, y+130, row[5][:24], 12, 450, "#536b84"), text(x+23, y+153, row[6][:23], 11, 650, "#21559e")]
    p.append('</svg>')
    (OUT / "tracking-board-flow.svg").write_text("".join(p), encoding="utf-8")


for slug, (title, headers, rows) in SCREENS.items():
    overview(slug, title, headers, rows)
    if slug == "tracking-board": tracking_flow(title, rows)
    else: detail(slug, title, headers, rows)

print(f"Generated {len(SCREENS)*2} synthetic concept images in {OUT}")
