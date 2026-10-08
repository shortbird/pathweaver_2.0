"""Build the Optio microschool pricing and credit transfer sheet.

Usage:
    python3 build_pricing.py

Writes Optio_Microschool_Pricing.pdf to the Desktop, and the HTML it prints
from plus page previews (PNG) to a temp directory for a visual check. Prices
live in PRICES; the worked examples are computed from them, so a price change
is one edit.
"""
import os
import re
import subprocess
import tempfile

REPO = "/Users/optio/pathweaver_2.0"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT_DIR = os.path.expanduser("~/Desktop")

PRICES = {
    "tuition_month": 50,        # private pay tuition, per month
    "credits_per_year": 6,      # credits the tuition covers each year
    "credit_private": 100,      # one credit, private pay
    "credit_school": 50,        # one credit, student on a school license
    "license_year": 80,         # Optio license, per student per year
    "diploma_credits": 24,
    "max_transfer": 18,         # most credits a student may transfer in
}

with open(os.path.join(REPO, "marketing/public/images/OptioLogo-FullColor.svg")) as f:
    LOGO = re.sub(r"<\?xml[^>]*\?>\s*", "", f.read()).strip()


def money(n):
    return f"${n:,.0f}"


def values():
    p = PRICES
    years = p["diploma_credits"] // p["credits_per_year"]
    private_year = p["tuition_month"] * 12
    school_credits_year = p["credit_school"] * p["credits_per_year"]
    school_year = school_credits_year + p["license_year"]
    return {
        "TUITION_MONTH": money(p["tuition_month"]),
        "CREDITS_PER_YEAR": str(p["credits_per_year"]),
        "CREDIT_PRIVATE": money(p["credit_private"]),
        "CREDIT_SCHOOL": money(p["credit_school"]),
        "LICENSE_YEAR": money(p["license_year"]),
        "DIPLOMA_CREDITS": str(p["diploma_credits"]),
        "MAX_TRANSFER": str(p["max_transfer"]),
        "MIN_OPTIO": str(p["diploma_credits"] - p["max_transfer"]),
        "YEARS": str(years),
        "PRIVATE_YEAR": money(private_year),
        "SCHOOL_CREDITS_YEAR": money(school_credits_year),
        "SCHOOL_YEAR": money(school_year),
        "SAVE_YEAR": money(private_year - school_year),
        "PRIVATE_DIPLOMA": money(private_year * years),
        "SCHOOL_LICENSE_DIPLOMA": money(p["license_year"] * years),
        "SCHOOL_CREDITS_DIPLOMA": money(p["credit_school"] * p["diploma_credits"]),
        "SCHOOL_DIPLOMA": money(school_year * years),
        "SAVE_DIPLOMA": money((private_year - school_year) * years),
        "EX_PRIVATE_EXTRA": money(p["credit_private"] * 2),
        "EX_SCHOOL_EXTRA": money(p["credit_school"] * 2),
        "EX_PRIVATE_REVIEW": money(p["credit_private"] * 5),
        "EX_SCHOOL_REVIEW": money(p["credit_school"] * 5),
    }


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Optio Academy Pricing and Credit Transfers for Microschools</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: Letter; margin: 0.6in 0.75in 0.65in 0.75in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Poppins', system-ui, sans-serif;
    font-size: 10pt; line-height: 1.45; color: #374151;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1, h2, h3 { color: #111827; margin: 0; break-after: avoid; page-break-after: avoid; }
  h1 { font-size: 20pt; font-weight: 700; line-height: 1.2; }
  h2 { font-size: 12.5pt; font-weight: 600; margin-top: 16pt; margin-bottom: 5pt; }
  p { margin: 0 0 7pt 0; }
  ul { margin: 0 0 7pt 0; padding-left: 16pt; }
  li { margin-bottom: 2pt; break-inside: avoid; page-break-inside: avoid; }
  strong { font-weight: 600; color: #111827; }
  .eyebrow { font-size: 8pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #6D469B; margin-bottom: 4pt; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24pt; padding-bottom: 12pt; margin-bottom: 14pt; border-bottom: 2.5pt solid; border-image: linear-gradient(135deg, #6D469B, #EF597B) 1; }
  .header svg { height: 34pt; width: auto; display: block; }
  .header .meta { text-align: right; font-size: 9pt; color: #6B7280; }
  .header .meta div { margin-bottom: 2pt; }
  .lede { font-size: 10.5pt; margin-top: 5pt; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10pt; margin: 10pt 0 4pt 0; break-inside: avoid; page-break-inside: avoid; }
  .tile { background: #F3EFF4; border-radius: 6pt; padding: 10pt 12pt; }
  .tile .big { font-size: 18pt; font-weight: 700; line-height: 1.1; color: #6D469B; }
  .tile .what { font-size: 9pt; color: #374151; margin-top: 3pt; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 6pt 0 8pt 0; font-size: 9.5pt; break-inside: avoid; page-break-inside: avoid; }
  th, td { text-align: left; vertical-align: top; padding: 6pt 8pt; border-bottom: 1px solid #E5E7EB; }
  th { font-weight: 600; color: #111827; background: #F3EFF4; font-size: 9pt; }
  td:first-child { color: #111827; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.school { color: #6D469B; font-weight: 600; }
  tr.total td { font-weight: 600; color: #111827; border-top: 1.5pt solid #111827; }
  tr.total td.school { color: #6D469B; }
  .callout { border-left: 3pt solid #EF597B; background: #FFF7F9; padding: 8pt 12pt; margin: 6pt 0 8pt 0; border-radius: 0 4pt 4pt 0; break-inside: avoid; page-break-inside: avoid; }
  .callout p:last-child { margin-bottom: 0; }
  .footer { margin-top: 16pt; padding-top: 8pt; border-top: 1px solid #E5E7EB; font-size: 8pt; color: #6B7280; line-height: 1.45; }
  .keep { break-inside: avoid; page-break-inside: avoid; }
</style>
</head>
<body>

<div class="header">
  <div>{{LOGO}}</div>
  <div class="meta">
    <div class="eyebrow">Optio Academy · For Microschools</div>
    <div><strong>Pricing and Credit Transfers</strong></div>
    <div>www.optioeducation.com</div>
  </div>
</div>

<h1>Pricing and credit transfers</h1>
<p class="lede">Students at your school can earn an accredited high school diploma from Optio Academy, a private K-12 school accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges (ACS WASC). This sheet shows what credits and credit transfers cost, and the discount your students get when your school holds an Optio license for them.</p>

<div class="tiles">
  <div class="tile"><div class="big">{{LICENSE_YEAR}}</div><div class="what">Optio license, per student per year</div></div>
  <div class="tile"><div class="big">{{CREDIT_SCHOOL}}</div><div class="what">Per credit for a licensed student</div></div>
  <div class="tile"><div class="big">Free</div><div class="what">Transfer of credits from an accredited school</div></div>
</div>

<h2>How the diploma works</h2>
<p>An Optio Academy high school diploma requires {{DIPLOMA_CREDITS}} credits. Most students earn {{CREDITS_PER_YEAR}} credits a year, so the diploma takes {{YEARS}} years. A student may earn credits faster than that. Credits a student already earned at another school can count toward the {{DIPLOMA_CREDITS}}.</p>
<p><strong>Up to {{MAX_TRANSFER}} credits can transfer in. At least {{MIN_OPTIO}} credits must be earned through Optio.</strong></p>
<p>The student stays at your school for everything. Their diploma and transcript name Optio Academy.</p>

<h2>Prices</h2>
<table>
  <thead><tr><th style="width:40%">What it is</th><th class="num" style="width:24%">Private pay family</th><th class="num" style="width:36%">Student on your school's license</th></tr></thead>
  <tbody>
    <tr><td>Optio license (the full Optio app)</td><td class="num">Included in tuition</td><td class="num school">{{LICENSE_YEAR}} a year</td></tr>
    <tr><td>Credits earned at Optio</td><td class="num">{{CREDIT_PRIVATE}} a credit</td><td class="num school">{{CREDIT_SCHOOL}} a credit</td></tr>
    <tr><td>Extra credits, to finish faster</td><td class="num">{{CREDIT_PRIVATE}} a credit</td><td class="num school">{{CREDIT_SCHOOL}} a credit</td></tr>
    <tr><td>Transfer from an accredited school</td><td class="num">Free</td><td class="num school">Free</td></tr>
    <tr><td>Transfer from a school that is not accredited</td><td class="num">{{CREDIT_PRIVATE}} a credit</td><td class="num school">{{CREDIT_SCHOOL}} a credit</td></tr>
  </tbody>
</table>
<p>A licensed student in your program pays half the private pay price for every credit.</p>

<div class="keep">
<h2>Credit transfers</h2>
<p><strong>From an accredited school.</strong> Upload the student's transcript in Optio. Optio Academy adds the credits to the student's transcript. There is no charge.</p>
<p><strong>From a school that is not accredited.</strong> This includes homeschool, co-ops, online programs and microschools without accreditation. Upload the transcript or progress reports, a short description of each class (what the student studied, about how many hours, and how the work was graded), and any samples of the student's work. An Optio Academy teacher reviews each class and decides how much credit it is worth. Approved credits go on the student's Optio Academy transcript as accredited credit.</p>
<p>Transfers from both kinds of school count toward the same limit: {{MAX_TRANSFER}} credits at most, so at least {{MIN_OPTIO}} of the {{DIPLOMA_CREDITS}} credits are earned through Optio.</p>
</div>

<div class="keep">
<h2>What a diploma costs</h2>
<p>One student who earns {{CREDITS_PER_YEAR}} credits a year for {{YEARS}} years:</p>
<table>
  <thead><tr><th style="width:40%"></th><th class="num" style="width:24%">Private pay family</th><th class="num" style="width:36%">Student on your school's license</th></tr></thead>
  <tbody>
    <tr><td>One year of credits ({{CREDITS_PER_YEAR}} credits)</td><td class="num">{{PRIVATE_YEAR}}</td><td class="num school">{{SCHOOL_CREDITS_YEAR}}</td></tr>
    <tr><td>One year of the Optio license</td><td class="num">Included</td><td class="num school">{{LICENSE_YEAR}}</td></tr>
    <tr><td>One year, total</td><td class="num">{{PRIVATE_YEAR}}</td><td class="num school">{{SCHOOL_YEAR}}</td></tr>
    <tr class="total"><td>Full diploma ({{DIPLOMA_CREDITS}} credits, {{YEARS}} years)</td><td class="num">{{PRIVATE_DIPLOMA}}</td><td class="num school">{{SCHOOL_DIPLOMA}}</td></tr>
  </tbody>
</table>
<div class="callout"><p>Your licensed student saves <strong>{{SAVE_YEAR}} a year</strong> and <strong>{{SAVE_DIPLOMA}} over a full diploma</strong>, and that total includes the Optio license. The license also gives the student the full Optio app for the year.</p></div>
</div>

<div class="keep">
<h2>Two more examples</h2>
<table>
  <thead><tr><th style="width:40%"></th><th class="num" style="width:24%">Private pay family</th><th class="num" style="width:36%">Student on your school's license</th></tr></thead>
  <tbody>
    <tr><td>2 extra credits in one year, to finish early</td><td class="num">{{EX_PRIVATE_EXTRA}}</td><td class="num school">{{EX_SCHOOL_EXTRA}}</td></tr>
    <tr><td>5 credits transferred from a school that is not accredited</td><td class="num">{{EX_PRIVATE_REVIEW}}</td><td class="num school">{{EX_SCHOOL_REVIEW}}</td></tr>
    <tr><td>5 credits transferred from an accredited school</td><td class="num">Free</td><td class="num school">Free</td></tr>
  </tbody>
</table>
</div>

<div class="footer">
  Optio Academy is accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges, 533 Airport Blvd., Suite 200, Burlingame, CA 94010, www.acswasc.org.
</div>

</body>
</html>
"""


def build():
    page = PAGE.replace("{{LOGO}}", LOGO)
    for key, value in values().items():
        page = page.replace("{{" + key + "}}", value)
    leftover = re.findall(r"\{\{[A-Z_]+\}\}", page)
    if leftover:
        sys_exit = f"unfilled fields: {sorted(set(leftover))}"
        raise SystemExit(sys_exit)

    work_dir = tempfile.mkdtemp(prefix="optio_pricing_")
    html_path = os.path.join(work_dir, "pricing.html")
    with open(html_path, "w") as f:
        f.write(page)
    pdf_path = os.path.join(OUT_DIR, "Optio_Microschool_Pricing.pdf")
    subprocess.run([
        CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
        "--virtual-time-budget=15000", f"--print-to-pdf={pdf_path}", f"file://{html_path}",
    ], check=True, capture_output=True)
    import pymupdf
    doc = pymupdf.open(pdf_path)
    for i, page_obj in enumerate(doc, 1):
        page_obj.get_pixmap(dpi=80).save(os.path.join(work_dir, f"pricing-p{i}.png"))
    print(pdf_path)
    print(work_dir, len(doc), "pages")


if __name__ == "__main__":
    build()
