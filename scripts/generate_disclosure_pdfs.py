"""Generate the two scholarship-program disclosure PDFs from existing
Academy Agreement / Handbook content. Run from repo root:

    python3 scripts/generate_disclosure_pdfs.py

Writes:
    docs/disclosures/Optio_Academy_Tuition_and_Fees_Disclosure.pdf
    docs/disclosures/Optio_Academy_Educational_Services_Disclosure.pdf
"""

import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem, PageBreak,
)
from reportlab.lib.colors import HexColor

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "disclosures")
OUT_DIR = os.path.abspath(OUT_DIR)
os.makedirs(OUT_DIR, exist_ok=True)

EFFECTIVE_DATE = "May 22, 2026"
OPTIO_PURPLE = HexColor("#6d469b")

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "TitleStyle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=20, leading=24, alignment=TA_CENTER, textColor=OPTIO_PURPLE,
    spaceAfter=6,
)
subtitle_style = ParagraphStyle(
    "SubtitleStyle", parent=styles["Normal"], fontName="Helvetica",
    fontSize=11, leading=14, alignment=TA_CENTER, textColor=HexColor("#444444"),
    spaceAfter=18,
)
h2_style = ParagraphStyle(
    "H2Style", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=14, leading=18, spaceBefore=14, spaceAfter=6,
    textColor=HexColor("#222222"),
)
h3_style = ParagraphStyle(
    "H3Style", parent=styles["Heading3"], fontName="Helvetica-Bold",
    fontSize=11.5, leading=14, spaceBefore=10, spaceAfter=4,
    textColor=HexColor("#333333"),
)
body_style = ParagraphStyle(
    "BodyStyle", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=10.5, leading=15, alignment=TA_LEFT, spaceAfter=6,
)
small_style = ParagraphStyle(
    "SmallStyle", parent=styles["Normal"], fontName="Helvetica-Oblique",
    fontSize=9, leading=12, textColor=HexColor("#666666"),
)


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(t, body_style), leftIndent=10) for t in items],
        bulletType="bullet", bulletFontSize=8, leftIndent=18,
    )


def header_block():
    return [
        Paragraph("Optio Academy", title_style),
        Paragraph(
            "Optio, LLC &nbsp;|&nbsp; 1555 Freedom Blvd 200 W, Provo, UT 84604 "
            "&nbsp;|&nbsp; optioeducation.com",
            subtitle_style,
        ),
    ]


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(HexColor("#888888"))
    canvas.drawString(
        0.75 * inch, 0.5 * inch,
        f"Optio Academy  |  Effective {EFFECTIVE_DATE}",
    )
    canvas.drawRightString(
        LETTER[0] - 0.75 * inch, 0.5 * inch,
        f"Page {doc.page}",
    )
    canvas.restoreState()


def build_tuition_pdf():
    path = os.path.join(OUT_DIR, "Optio_Academy_Tuition_and_Fees_Disclosure.pdf")
    doc = SimpleDocTemplate(
        path, pagesize=LETTER,
        leftMargin=0.85 * inch, rightMargin=0.85 * inch,
        topMargin=0.75 * inch, bottomMargin=0.85 * inch,
        title="Optio Academy - Tuition and Fees Disclosure",
        author="Optio, LLC",
    )

    story = []
    story += header_block()
    story.append(Paragraph("Tuition and Fees Disclosure", h2_style))
    story.append(Paragraph(f"Effective Date: {EFFECTIVE_DATE}", small_style))
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "This document discloses the tuition costs and any additional fees a parent "
        "or guardian may be required to pay during the school year for a student "
        "enrolled in Optio Academy, a fully online private school operated by Optio, "
        "LLC for grades 9 through 12.",
        body_style,
    ))

    story.append(Paragraph("Annual Tuition", h3_style))
    story.append(Paragraph(
        "Annual tuition for Optio Academy is <b>$8,000 per student per school year</b>, "
        "billed on the schedule agreed at enrollment (annual or installment plan). "
        "Tuition includes:",
        body_style,
    ))
    story.append(bullets([
        "Daily 1-on-1 mentor sessions with a dedicated teacher",
        "All curriculum materials across the five skill pillars",
        "Full access to the Optio digital learning platform",
        "An AI study buddy for between-session support",
        "Online showcases and student community",
        "The student's transcript and official records",
        "The Optio Academy diploma pathway",
    ]))

    story.append(Paragraph("Additional Fees Required During the School Year", h3_style))
    story.append(Paragraph(
        "<b>None.</b> Optio Academy charges no additional required fees during the "
        "school year. Specifically, there is:",
        body_style,
    ))
    story.append(bullets([
        "No enrollment or registration fee",
        "No curriculum or materials fee",
        "No technology or platform fee",
        "No testing, assessment, or transcript fee",
        "No graduation or diploma fee",
        "No activity, showcase, or community fee",
    ]))
    story.append(Paragraph(
        "The annual tuition is the full cost of attendance. Optio Academy does not "
        "require families to purchase outside textbooks, software, hardware, or "
        "supplies as a condition of participation. Because the program is delivered "
        "fully online with no physical campus, there are no transportation, meal, "
        "uniform, or facilities fees.",
        body_style,
    ))

    story.append(Paragraph("Tuition Parity for Scholarship-Funded Students", h3_style))
    story.append(Paragraph(
        "Tuition, fees, and refund terms for students whose tuition is funded by a "
        "scholarship or other third-party program are <b>identical</b> to those for "
        "students paying tuition directly. Optio Academy does not charge "
        "scholarship-funded students more than non-scholarship students for the same "
        "program.",
        body_style,
    ))

    story.append(Paragraph("Refund Policy", h3_style))
    story.append(Paragraph(
        "If a student withdraws from Optio Academy before the end of the school year, "
        "tuition is refunded prorated by the number of months the student attended. "
        "Months in which the student was enrolled for any part of the month count as "
        "a full attended month for purposes of this calculation.",
        body_style,
    ))
    story.append(Paragraph(
        "If a student's tuition was funded in whole or in part by a government or "
        "third-party scholarship program, any refund owed under this policy is "
        "remitted directly to the program manager or financial administrator of that "
        "program for redeposit into the student's scholarship account, in accordance "
        "with that program's rules. Refunds are not remitted to the parent or "
        "student in such cases, except where the program's own rules require "
        "otherwise.",
        body_style,
    ))

    story.append(Paragraph("No Rebates or Pass-Throughs", h3_style))
    story.append(Paragraph(
        "Optio Academy does not refund, rebate, or otherwise share scholarship funds "
        "with the parent or student outside the financial-administrator channel "
        "established by the applicable scholarship program. Optio Academy does not "
        "pay commissions, kickbacks, or other inducements to families in exchange "
        "for enrollment.",
        body_style,
    ))

    story.append(Paragraph("Payment Processing", h3_style))
    story.append(Paragraph(
        "Tuition payments from families paying directly are processed through Stripe. "
        "Tuition payments funded by a scholarship program are processed through that "
        "program's financial administrator. Payment plans are available; specific "
        "terms are agreed at enrollment.",
        body_style,
    ))

    story.append(Paragraph("Pricing Changes", h3_style))
    story.append(Paragraph(
        "Optio Academy reserves the right to modify tuition pricing with at least 30 "
        "days' advance notice. Pricing changes do not affect tuition for the current "
        "school year for students already enrolled.",
        body_style,
    ))

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        "This disclosure is provided as part of Optio Academy's pre-enrollment "
        "disclosures to prospective families and scholarship program administrators, "
        "and is incorporated by reference into the Optio Academy Participant &amp; "
        "Parent Agreement, available at optioeducation.com/academy-agreement.",
        small_style,
    ))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return path


def build_services_pdf():
    path = os.path.join(OUT_DIR, "Optio_Academy_Educational_Services_Disclosure.pdf")
    doc = SimpleDocTemplate(
        path, pagesize=LETTER,
        leftMargin=0.85 * inch, rightMargin=0.85 * inch,
        topMargin=0.75 * inch, bottomMargin=0.85 * inch,
        title="Optio Academy - Educational Services and Curriculum Disclosure",
        author="Optio, LLC",
    )

    story = []
    story += header_block()
    story.append(Paragraph("Educational Services and Curriculum Disclosure", h2_style))
    story.append(Paragraph(f"Effective Date: {EFFECTIVE_DATE}", small_style))
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "This document discloses the educational services Optio Academy provides to "
        "scholarship students and the skill and grade level of the curriculum in "
        "which a prospective scholarship student will participate.",
        body_style,
    ))

    story.append(Paragraph("School Type and Grade Level", h3_style))
    story.append(Paragraph(
        "Optio Academy is a <b>fully online private school</b> operated by Optio, LLC, "
        "a Utah limited liability company. The Academy serves students in "
        "<b>grades 9 through 12</b> (high school) and offers a high school diploma "
        "pathway. Curriculum is aligned with <b>Utah core standards for high school</b>.",
        body_style,
    ))
    story.append(Paragraph(
        "A prospective scholarship student will participate at the grade level "
        "appropriate to their prior schooling and academic placement, within grades "
        "9 – 12. Placement is determined in collaboration with the student's "
        "dedicated teacher at enrollment.",
        body_style,
    ))

    story.append(Paragraph("Mode of Instruction", h3_style))
    story.append(Paragraph(
        "Optio Academy is delivered fully online. Instruction occurs through the "
        "Optio digital platform combined with <b>daily 1-on-1 video sessions</b> "
        "between the student and a dedicated teacher. There is no physical campus "
        "and no in-person instructional component.",
        body_style,
    ))

    story.append(Paragraph("Academic Calendar", h3_style))
    story.append(Paragraph(
        "The Optio Academy school year begins on September 1 and runs through late "
        "May, providing full-time, year-long enrollment. Specific instructional days, "
        "holidays, and breaks are published in the Optio Academy Participant Handbook "
        "and updated annually.",
        body_style,
    ))

    story.append(Paragraph("Curriculum and Five Skill Pillars", h3_style))
    story.append(Paragraph(
        "Each student's curriculum is personalized in collaboration with the "
        "student's dedicated teacher, mapped to five interconnected skill pillars, "
        "and aligned with Utah core standards for high school:",
        body_style,
    ))
    story.append(bullets([
        "<b>STEM:</b> Science, Technology, Engineering, and Mathematics",
        "<b>Communication:</b> Writing, speaking, language arts, and storytelling",
        "<b>Civics:</b> Social studies, government, history, and community",
        "<b>Wellness:</b> Physical education, health, mental health, and personal "
        "development",
        "<b>Art:</b> Creative expression, design, music, and performance",
    ]))
    story.append(Paragraph(
        "Students earn credit toward an Optio Academy diploma by completing quests "
        "(project-based learning challenges), documenting evidence of learning, and "
        "demonstrating mastery to their dedicated teacher.",
        body_style,
    ))

    story.append(Paragraph("Educational Services Provided", h3_style))
    story.append(Paragraph(
        "Tuition entitles each enrolled scholarship student to all of the following "
        "services for the duration of the school year:",
        body_style,
    ))
    story.append(bullets([
        "A dedicated teacher who meets with the student in a 1-on-1 video session "
        "every weekday",
        "Full access to the Optio digital learning platform",
        "Personalized curriculum across the five skill pillars, aligned with Utah "
        "core high school standards",
        "Project-based quests, tasks, and learning evidence tools",
        "An AI study buddy for between-session help and tutoring",
        "Online showcases and a community of fellow students",
        "Progress tracking, badges, and a public portfolio of student work",
        "Official transcript and academic records",
        "Diploma pathway leading to an Optio Academy high school diploma",
    ]))

    story.append(Paragraph("Educational Philosophy", h3_style))
    story.append(Paragraph(
        "Optio Academy operates on the educational philosophy that "
        "<i>The Process Is The Goal.</i> Learning is valued for its intrinsic worth "
        "and for the growth it creates in the present moment. The Academy combines "
        "daily 1-on-1 contact with a dedicated teacher and project-based learning "
        "across the five skill pillars.",
        body_style,
    ))

    story.append(Paragraph("Accreditation Status", h3_style))
    story.append(Paragraph(
        "Optio Academy is actively pursuing institutional accreditation for the "
        "2026 – 2027 school year. The Academy will publish its accrediting body and "
        "effective accreditation date on the Optio Academy website "
        "(optioeducation.com/academy) once accreditation is final. Until "
        "accreditation is finalized, the Academy makes no representation that it is "
        "currently accredited.",
        body_style,
    ))

    story.append(Paragraph("Nondiscrimination", h3_style))
    story.append(Paragraph(
        "Optio Academy admits students of any race, color, and national origin to "
        "all the rights, privileges, programs, and activities generally accorded or "
        "made available to students at the school. Optio Academy does not "
        "discriminate on the basis of race, color, or national origin in "
        "administration of its educational policies, admissions policies, "
        "scholarship and loan programs, or other school-administered programs, in "
        "compliance with Title VI of the Civil Rights Act of 1964.",
        body_style,
    ))

    story.append(Paragraph("Right to Transfer", h3_style))
    story.append(Paragraph(
        "Nothing in enrollment with Optio Academy waives, restricts, or penalizes a "
        "student's right to withdraw from Optio Academy and transfer to another "
        "qualifying provider or school during the school year. The Academy does not "
        "require any student or parent to sign a contract, addendum, or other "
        "document that limits this right.",
        body_style,
    ))

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        "This disclosure is provided as part of Optio Academy's pre-enrollment "
        "disclosures to prospective families and scholarship program administrators, "
        "and is incorporated by reference into the Optio Academy Participant &amp; "
        "Parent Agreement, available at optioeducation.com/academy-agreement, and "
        "the Optio Academy Participant Handbook, available at "
        "optioeducation.com/academy-handbook.",
        small_style,
    ))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return path


if __name__ == "__main__":
    p1 = build_tuition_pdf()
    p2 = build_services_pdf()
    print("Wrote:")
    print(f"  {p1}")
    print(f"  {p2}")
