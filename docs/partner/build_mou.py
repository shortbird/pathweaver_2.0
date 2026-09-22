"""Build the Optio Credit Partner MOU: a blank template and a filled copy.

Usage: python3 build_mou.py
Writes <name>.html and <name>.pdf next to this script for each variant, plus
page previews (<name>-p<N>.png) for a visual check.
"""
import html
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = "/Users/optio/pathweaver_2.0"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

with open(os.path.join(REPO, "marketing/public/images/OptioLogo-FullColor.svg")) as f:
    LOGO = re.sub(r"<\?xml[^>]*\?>\s*", "", f.read()).strip()


def fill(text):
    """A field the sender still has to fill in."""
    return f'<span class="fill">{html.escape(text)}</span>'


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Memorandum of Understanding · Optio Academy and {{PROGRAM_NAME_PLAIN}}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: Letter; margin: 0.65in 0.75in 0.7in 0.75in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Poppins', system-ui, sans-serif;
    font-size: 10pt; line-height: 1.45; color: #374151;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1, h2, h3 { color: #111827; margin: 0; break-after: avoid; page-break-after: avoid; }
  h1 { font-size: 20pt; font-weight: 700; line-height: 1.2; }
  h2 { font-size: 12pt; font-weight: 600; margin-top: 15pt; margin-bottom: 4pt; }
  h2 .num { color: #6D469B; margin-right: 6pt; }
  p { margin: 0 0 7pt 0; }
  ul { margin: 0 0 7pt 0; padding-left: 16pt; }
  li { margin-bottom: 2pt; }
  strong { font-weight: 600; color: #111827; }
  .eyebrow { font-size: 8pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #6D469B; margin-bottom: 4pt; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24pt; padding-bottom: 12pt; margin-bottom: 14pt; border-bottom: 2.5pt solid; border-image: linear-gradient(135deg, #6D469B, #EF597B) 1; }
  .header svg { height: 34pt; width: auto; display: block; }
  .header .meta { text-align: right; font-size: 9pt; color: #6B7280; }
  .header .meta div { margin-bottom: 2pt; }
  .lede { font-size: 10.5pt; color: #374151; margin-bottom: 4pt; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin: 6pt 0 4pt 0; break-inside: avoid; page-break-inside: avoid; }
  .card { background: #F3EFF4; border-radius: 6pt; padding: 10pt 12pt; font-size: 9.5pt; }
  .card .who { font-weight: 600; color: #111827; font-size: 10.5pt; margin-bottom: 4pt; }
  .card div { margin-bottom: 1.5pt; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 6pt 0; font-size: 9.5pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { text-align: left; vertical-align: top; padding: 6pt 8pt; border-bottom: 1px solid #E5E7EB; }
  th { font-weight: 600; color: #111827; background: #F3EFF4; font-size: 9pt; }
  td:first-child { font-weight: 600; color: #111827; white-space: nowrap; }
  .fill { color: #6D469B; font-weight: 600; background: #F3EFF4; border-bottom: 1px solid #6D469B; padding: 0 3pt; border-radius: 2pt; }
  .callout { border-left: 3pt solid #EF597B; background: #FFF7F9; padding: 8pt 12pt; margin: 6pt 0 8pt 0; border-radius: 0 4pt 4pt 0; break-inside: avoid; page-break-inside: avoid; }
  .callout p:last-child { margin-bottom: 0; }
  .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 24pt; margin-top: 10pt; break-inside: avoid; page-break-inside: avoid; }
  .sig .block .who { font-weight: 600; color: #111827; margin-bottom: 6pt; }
  .sig .line { border-bottom: 1px solid #9CA3AF; height: 18pt; margin-bottom: 2pt; }
  .sig .label { font-size: 8pt; color: #6B7280; margin-bottom: 6pt; }
  .footer { margin-top: 14pt; padding-top: 8pt; border-top: 1px solid #E5E7EB; font-size: 8pt; color: #6B7280; line-height: 1.45; }
  li { break-inside: avoid; page-break-inside: avoid; }
</style>
</head>
<body>

<div class="header">
  <div>{{LOGO}}</div>
  <div class="meta">
    <div class="eyebrow">Optio Academy · Credit Partner Program</div>
    <div><strong>Memorandum of Understanding</strong></div>
    <div>Prepared {{DATE}}</div>
  </div>
</div>

<h1>Memorandum of Understanding</h1>
<p class="lede" style="margin-top:4pt">Between Optio and {{PROGRAM_NAME}}</p>
<p>This memorandum describes how Optio and {{PROGRAM_NAME}} will work together so that students in {{PROGRAM_NAME}} can earn high school credit for the work they already do there. It is written in plain language on purpose. If anything here is unclear, ask before you sign.</p>

<h2><span class="num">1.</span>Who this is between</h2>
<div class="parties">
  <div class="card">
    <div class="who">Optio</div>
    <div>Optio, LLC, which operates Optio Academy</div>
    <div>Tanner Bowman, Founder and Head of School</div>
    <div>tanner@optioeducation.com</div>
    <div>www.optioeducation.com</div>
  </div>
  <div class="card">
    <div class="who">The Program</div>
    <div>{{PROGRAM_NAME}}</div>
    <div>{{PROGRAM_LOCATION}}</div>
    <div>{{PROGRAM_CONTACT}}</div>
    <div>{{PROGRAM_EMAIL}}</div>
  </div>
</div>
<p>In the rest of this document, "the Program" means {{PROGRAM_NAME}}.</p>

<h2><span class="num">2.</span>What this arrangement is</h2>
<p>Optio Academy is a private K-12 school accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges (ACS WASC). It awards credit for real work that a student documents, in place of hours spent in a classroom.</p>
<p>Under this arrangement, a student who takes part in the Program and records their learning in the Optio app earns credit on an official Optio Academy transcript. Optio sends that transcript to the school the family names. The Program does not become a school, does not grade anyone, and does not change how it runs.</p>

<div class="section">
<h2><span class="num">3.</span>The credit</h2>
<table>
  <thead><tr><th style="width:17%">Subject</th><th style="width:13%">Credit per term</th><th>What earns the credit</th><th style="width:24%">Term dates</th></tr></thead>
  <tbody>
{{CREDIT_ROWS}}
  </tbody>
</table>
<p>One term of weekly participation with weekly learning evidence counts as one semester class. Optio may add a subject or adjust a credit amount if both parties agree in writing.</p>
</div>

<div class="section">
<h2><span class="num">4.</span>What Optio does</h2>
<ul>
  <li>Sets up the Program inside Optio and gives the Program one enrollment link to share with families.</li>
  <li>Enrolls each student and collects parent consent through that link.</li>
  <li>Provides the Optio app, where students record their learning evidence.</li>
  <li>Has a licensed Optio teacher review each student's evidence at the end of the term and award the credit.</li>
  <li>Issues the official transcript and sends it to the school the family named when they enrolled.</li>
  <li>Answers questions from students and parents about enrollment, the app, and the credit. The contact for families is {{OPTIO_FAMILY_CONTACT}}.</li>
</ul>
</div>

<div class="section">
<h2><span class="num">5.</span>What the Program does</h2>
<ul>
  <li>Shares the enrollment link with families and tells them about the credit option.</li>
  <li>Runs the Program as usual. Optio does not ask the Program to grade anyone, write lesson plans, or change its curriculum.</li>
  <li>At the end of each term, opens its roster in Optio and confirms which students took part. This takes a few minutes.</li>
  <li>Tells Optio if a student stops attending partway through a term.</li>
  <li>Follows the accreditation wording rules in section 8.</li>
</ul>
</div>

<div class="section">
<h2><span class="num">6.</span>What students and families do</h2>
<ul>
  <li>Enroll through the link. A parent signs off in the same form and names the school the transcript should go to.</li>
  <li>Take part in the Program as they already do.</li>
  <li>Record learning evidence in the Optio app at least once a week. Evidence can be {{EVIDENCE_EXAMPLES}}.</li>
  <li>Recording the evidence is the student's responsibility. A student who does not record evidence for the term does not receive credit for that term. There is no penalty and no mark on any record.</li>
</ul>
</div>

<div class="section">
<h2><span class="num">7.</span>Price and payment</h2>
<ul>
  <li>Optio charges the Program {{PRICE}} for each student enrolled in a credit class for one term.</li>
  <li>The Program sets its own price to families and collects it. The Program keeps any amount above Optio's fee.</li>
  <li>Optio sends the Program one invoice {{INVOICE_TIMING}} listing the enrolled students. Payment is due within {{PAYMENT_DAYS}} days of the invoice date.</li>
  <li>If a student withdraws within the first {{WITHDRAW_DAYS}} days of a term, Optio does not charge for that student.</li>
</ul>
</div>

<div class="section">
<h2><span class="num">8.</span>How to describe the accreditation</h2>
<p>The accreditation is what makes the credit worth something, so there are a few firm rules about how it is described.</p>
<ul>
  <li>The credit comes from Optio Academy. The Program may say: "Students can earn high school credit through Optio Academy, a private K-12 school accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges."</li>
  <li>The Program does not describe itself as accredited, and does not use the commission's logo. Optio is licensed to display it. Partners are not.</li>
  <li>Wherever the Program mentions the accreditation in writing, it includes the commission's full name, address, and website. The line at the bottom of this document is exactly what to paste.</li>
  <li>The Program sends new wording about the credit or the accreditation to Optio before it goes live. A quick read takes a day.</li>
</ul>
</div>

<div class="section">
<h2><span class="num">9.</span>Student information</h2>
<ul>
  <li>Optio holds all student records. The Program does not collect, store, or forward student records on Optio's behalf.</li>
  <li>Optio shows the Program its own roster of enrolled students so the Program can confirm participation. Optio does not share a student's evidence or grades with the Program.</li>
  <li>A student's work is visible to the student, their parent, and the Optio teacher who reviews it. Optio does not sell student data and does not use it for advertising.</li>
</ul>
</div>

<div class="section">
<h2><span class="num">10.</span>How long this lasts and how it ends</h2>
<ul>
  <li>This arrangement starts on the date of the last signature below and continues until either party ends it.</li>
  <li>Either party may end it with 30 days' written notice. Email counts as written notice.</li>
  <li>Students already enrolled in a term finish that term and receive their credit. Optio's fee for those students still applies.</li>
  <li>Optio may end the arrangement at once if the Program describes the accreditation in a way that breaks section 8 and does not correct it within 7 days of Optio asking.</li>
</ul>
</div>

<div class="section">
<h2><span class="num">11.</span>About this document</h2>
<p>This is a working agreement between two independent businesses. It does not create a legal partnership, a joint venture, or an employment relationship, and neither party may make commitments for the other. Both parties intend to follow it. Any change to it is agreed in writing by both parties. Sections 7, 8, and 9 continue to apply to students enrolled before the arrangement ends.</p>
</div>

<div class="sig">
  <div class="block">
    <div class="who">Optio, LLC</div>
    <div class="line"></div><div class="label">Signature</div>
    <div class="line" style="height:11pt"></div><div class="label">Name and title</div>
    <div class="line" style="height:11pt"></div><div class="label">Date</div>
  </div>
  <div class="block">
    <div class="who">{{PROGRAM_NAME}}</div>
    <div class="line"></div><div class="label">Signature</div>
    <div class="line" style="height:11pt"></div><div class="label">Name and title</div>
    <div class="line" style="height:11pt"></div><div class="label">Date</div>
  </div>
</div>

<div class="footer">
  Credit is awarded by Optio Academy, accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges, 533 Airport Blvd., Suite 200, Burlingame, CA 94010, www.acswasc.org.
</div>

</body>
</html>
"""


def row(subject, credit, earns, dates):
    return f"    <tr><td>{subject}</td><td>{credit}</td><td>{earns}</td><td>{dates}</td></tr>"


TEMPLATE = {
    "PROGRAM_NAME_PLAIN": "[Program name]",
    "PROGRAM_NAME": fill("[Program name]"),
    "PROGRAM_LOCATION": fill("[City, State]"),
    "PROGRAM_CONTACT": fill("[Contact name, title]"),
    "PROGRAM_EMAIL": fill("[Contact email]"),
    "DATE": fill("[Date]"),
    "CREDIT_ROWS": "\n".join([
        row(fill("[Subject]"), fill("[0.5]"), fill("[What a student does in the Program during one term to earn the credit]"), fill("[Start month] to [end month]")),
        row(fill("[Subject]"), fill("[0.5]"), fill("[Add one row per subject. Delete rows you do not need.]"), fill("[Start month] to [end month]")),
    ]),
    "OPTIO_FAMILY_CONTACT": fill("[Optio contact name, email]"),
    "EVIDENCE_EXAMPLES": fill("[a photo of a worksheet, a short video of practice, or a few sentences about what they worked on]"),
    "PRICE": fill("[$100]"),
    "INVOICE_TIMING": fill("[at the start of each term]"),
    "PAYMENT_DAYS": fill("[30]"),
    "WITHDRAW_DAYS": fill("[14]"),
}

MUSIC_SO_SIMPLE = {
    "PROGRAM_NAME_PLAIN": "Music So Simple",
    "PROGRAM_NAME": "Music So Simple",
    "PROGRAM_LOCATION": "Richardson, Texas",
    "PROGRAM_CONTACT": "Stathia Orwig, Owner",
    "PROGRAM_EMAIL": "stathia@musicsosimple.com",
    "DATE": "September 21, 2026",
    "CREDIT_ROWS": "\n".join([
        row("Fine Arts", "0.5",
            "One term of weekly private or group music lessons at Music So Simple, with learning evidence recorded each week, ending with the term recital.",
            "Fall: September to December<br>Spring: January to May"),
        row("Mathematics", "0.5",
            "Music theory study during the term, with learning evidence recorded each week, plus a passing score on the Texas State theory test.",
            "Fall: September to December<br>Spring: January to May"),
    ]),
    "OPTIO_FAMILY_CONTACT": "Emmeline Iglinski, emmeline@optioeducation.com",
    "EVIDENCE_EXAMPLES": "a photo of the weekly assignment sheet, a short video of practice, or a few sentences about the lesson",
    "PRICE": "$100",
    "INVOICE_TIMING": "at the start of each term",
    "PAYMENT_DAYS": "30",
    "WITHDRAW_DAYS": "14",
}


def render(values):
    out = PAGE.replace("{{LOGO}}", LOGO)
    for key, val in values.items():
        out = out.replace("{{" + key + "}}", val)
    missing = re.findall(r"{{[A-Z_]+}}", out)
    if missing:
        sys.exit(f"unfilled tokens: {missing}")
    return out


def build(name, values):
    html_path = os.path.join(HERE, name + ".html")
    pdf_path = os.path.join(HERE, name + ".pdf")
    with open(html_path, "w") as f:
        f.write(render(values))
    subprocess.run([
        CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
        "--virtual-time-budget=15000", f"--print-to-pdf={pdf_path}", f"file://{html_path}",
    ], check=True, capture_output=True)
    import pymupdf
    doc = pymupdf.open(pdf_path)
    for i, page in enumerate(doc, 1):
        page.get_pixmap(dpi=70).save(os.path.join(HERE, f"{name}-p{i}.png"))
    print(f"{name}: {doc.page_count} pages -> {pdf_path}")
    return html_path, pdf_path


if __name__ == "__main__":
    build("Optio_Credit_Partner_MOU_Template", TEMPLATE)
    build("Optio_MOU_Music_So_Simple", MUSIC_SO_SIMPLE)
