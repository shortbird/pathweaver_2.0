import re,sys
logo=open('/Users/optio/pathweaver_2.0/marketing/public/images/OptioLogo-FullColor.svg').read()
logo=re.sub(r'<\?xml.*?\?>','',logo).strip()
body=open('body.html').read().replace('{{LOGO}}',logo)
css='''
@page{size:Letter;margin:0.45in 0.6in}
*{box-sizing:border-box}
body{font-family:Poppins,sans-serif;font-size:10pt;line-height:1.45;color:#374151;margin:0}
.masthead{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:10px;border-bottom:1px solid #E5E7EB}
.logo svg{width:120px;height:auto}
.meta{font-size:8pt;text-align:right;color:#6B7280;line-height:1.6}
.meta span{text-transform:uppercase;letter-spacing:.06em;font-weight:600;color:#6D469B;margin-right:4px}
.hero{margin:14px 0 4px;padding:16px 22px;border-radius:12px;background:linear-gradient(135deg,#6D469B,#EF597B);color:#fff}
.hero .eyebrow{color:#fff;opacity:.85}
.hero h1{font-size:20pt;line-height:1.2;margin:4px 0 8px;color:#fff;font-weight:700}
.lede{margin:0;font-size:10.5pt}
.eyebrow{font-size:8pt;text-transform:uppercase;letter-spacing:.08em;font-weight:600;color:#6D469B}
h2{font-size:12pt;color:#111827;font-weight:600;margin:10px 0 3px;break-after:avoid}
h3{font-size:10pt;color:#111827;font-weight:600;margin:0 0 2px}
p{margin:0 0 8px}
.small{font-size:8.5pt}.muted{color:#6B7280}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}
.callout{display:flex;gap:14px;align-items:center;background:#F3EFF4;border-radius:10px;padding:10px 14px;break-inside:avoid}
.callout-num{font-size:22pt;font-weight:700;color:#6D469B;line-height:1}
.callout strong{color:#111827}.callout p{margin:2px 0 0}
ul.ticks{padding-left:18px;margin:0}ul.ticks li{margin-bottom:2px}
ul.ticks li::marker{color:#6D469B}
table{width:100%;border-collapse:collapse;break-inside:avoid;margin:6px 0 8px}
th,td{text-align:left;vertical-align:top;padding:5px 10px;border-bottom:1px solid #E5E7EB}
table.credit thead th{font-size:8pt;text-transform:uppercase;letter-spacing:.06em;color:#6D469B;background:#F3EFF4}
table.credit th:nth-child(1){width:90px}table.credit th:nth-child(2){width:60px}table.credit th:nth-child(4){width:150px}
td.num{font-size:14pt;font-weight:700;color:#6D469B}
table.timeline th{width:150px;color:#111827;font-weight:600}
ol.steps{counter-reset:s;list-style:none;padding:0;margin:0}
ol.steps li{counter-increment:s;position:relative;padding:2px 0 4px 34px;break-inside:avoid}
ol.steps li::before{content:counter(s);position:absolute;left:0;top:0;width:24px;height:24px;border-radius:50%;background:#EDE4F5;color:#6D469B;font-weight:600;font-size:9pt;display:flex;align-items:center;justify-content:center}
ol.steps strong,ul.ticks strong{color:#111827}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.card{border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;break-inside:avoid}
.card ul{padding-left:16px;margin:6px 0 4px}.card li{margin-bottom:2px}
.card p{margin:4px 0 0}
.faq .q{break-inside:avoid;margin-bottom:8px}
ol.asks{padding-left:18px}ol.asks li{margin-bottom:4px}
.contact{margin-top:12px;padding:10px 16px;background:#F3EFF4;border-radius:10px;break-inside:avoid}
.contact strong{color:#111827}
.tl{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;break-inside:avoid}
.tl div{border-top:3px solid #EDE4F5;padding-top:6px;font-size:9pt}
.tl strong{display:block;color:#6D469B;font-size:8.5pt}
.accred strong{color:#111827}
.accred{margin-top:8px;font-size:7.5pt;color:#6B7280;border-top:1px solid #E5E7EB;padding-top:8px}
'''
html=f'''<!doctype html><html><head><meta charset="utf-8"><title>High School Credit for Private Lessons</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{css}</style></head><body>{body}</body></html>'''
open('Optio_AGO_Lesson_Credit_Proposal.html','w').write(html)

# Spacing pass (2026-10-12): spread the one-page proposal to fill the sheet.
SPACING = '''
@page{size:Letter;margin:0.5in 0.65in}
body{font-size:10pt;line-height:1.5}
.masthead{padding-bottom:14px}
.hero{margin:18px 0 6px;padding:22px 24px}
h2{font-size:12.5pt;margin:14px 0 5px}
.stats{margin:14px 0;gap:12px}
.callout{padding:14px 16px}
ul.ticks li{margin-bottom:4px}
ol.steps li{padding:2px 0 7px 36px}
.grid{gap:12px}
.card{padding:14px 15px}
.accred{margin-top:14px;padding-top:8px}
'''
html = open('Optio_AGO_Lesson_Credit_Proposal.html').read().replace('</style>', SPACING + '</style>')
open('Optio_AGO_Lesson_Credit_Proposal.html', 'w').write(html)
