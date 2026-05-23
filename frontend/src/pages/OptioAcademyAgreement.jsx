import React from 'react'
import { Link } from 'react-router-dom'

const OptioAcademyAgreement = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Optio Academy Participant &amp; Parent Agreement</h1>

          <div className="prose prose-gray max-w-none">
            <p className="text-sm text-gray-600 mb-6">Effective Date: May 22, 2026</p>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-8">
              <p className="font-semibold text-blue-900">Important Notice</p>
              <p className="text-sm text-blue-800 mt-2">
                This Agreement is required for every student enrolling in Optio Academy, our fully online
                private school. Digital-only users of the Optio platform who are not enrolled in Optio
                Academy do not need to sign this Agreement.
              </p>
            </div>

            <section className="mb-8">
              <p className="mb-4">
                This Participant &amp; Parent Agreement ("Agreement") is a legally binding contract entered
                into by and between:
              </p>

              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <p className="mb-2"><strong>The Academy:</strong></p>
                <p className="ml-4">
                  Optio, LLC, a Utah limited liability company<br />
                  1555 Freedom Blvd 200 W<br />
                  Provo, UT 84604<br />
                  (Hereinafter referred to as "the Academy" or "Optio Academy")
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <p className="mb-2"><strong>The Participant:</strong></p>
                <p className="ml-4">
                  Student enrolling in Optio Academy (grades 9 – 12)<br />
                  (Hereinafter referred to as "the Participant" or "Student")
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="mb-2"><strong>The Parent(s)/Legal Guardian(s):</strong></p>
                <p className="ml-4">
                  Parent or guardian of the Participant<br />
                  (Hereinafter referred to as "the Parent," which refers to all signing Parent(s)/Legal Guardian(s))
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Introduction and Educational Philosophy</h2>
              <p className="mb-4">
                This Agreement governs the Participant's enrollment in Optio Academy, a fully online
                private school. Optio Academy is the Participant's primary school, where the Participant
                receives the majority of academic instruction. The Academy serves students in grades 9 – 12
                and offers a high school diploma pathway.
              </p>
              <p className="mb-4">
                Optio Academy operates on the educational philosophy that "The Process Is The Goal."
                Learning is valued for its intrinsic worth and for the growth it creates in the present
                moment. The Academy combines daily 1-on-1 contact with a dedicated teacher and project-based
                learning across five skill pillars (STEM, Communication, Civics, Wellness, and Art).
              </p>
              <p className="mb-4">
                This Agreement incorporates the{' '}
                <Link to="/academy-handbook" className="text-primary hover:text-optio-purple underline">
                  Optio Academy Participant Handbook
                </Link>{' '}
                ("Handbook") by reference. The Parent and Participant agree they have received, read, and
                will abide by the Handbook.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Program Description</h2>

              <h3 className="text-xl font-semibold mb-3">Mode of Instruction</h3>
              <p className="mb-4">
                Optio Academy is delivered fully online. Instruction occurs through the Optio digital
                platform combined with daily 1-on-1 video sessions between the Participant and a dedicated
                teacher. There is no physical campus and no in-person instructional component.
              </p>

              <h3 className="text-xl font-semibold mb-3">Academic Calendar</h3>
              <p className="mb-4">
                The Optio Academy school year begins on September 1 and runs through late May, providing
                full-time, year-long enrollment. Specific instructional days, holidays, and breaks are
                published in the Handbook and updated annually.
              </p>

              <h3 className="text-xl font-semibold mb-3">Curriculum</h3>
              <p className="mb-4">
                The Participant's curriculum is personalized in collaboration with the Participant's
                dedicated teacher, mapped to the five skill pillars, and aligned with Utah core standards
                for high school. The Participant earns credit toward an Optio Academy diploma by
                completing quests, documenting evidence of learning, and demonstrating mastery to the
                teacher.
              </p>

              <h3 className="text-xl font-semibold mb-3">Accreditation Status</h3>
              <p className="mb-4">
                Optio Academy is actively pursuing institutional accreditation for the 2026 – 2027 school
                year. The Academy will publish its accrediting body and effective accreditation date on
                the{' '}
                <Link to="/academy" className="text-primary hover:text-optio-purple underline">
                  Optio Academy
                </Link>{' '}
                website page once accreditation is final. Until accreditation is finalized, the Academy
                makes no representation that it is currently accredited.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. Nondiscrimination</h2>
              <p className="mb-4">
                Optio Academy admits students of any race, color, and national origin to all the rights,
                privileges, programs, and activities generally accorded or made available to students at
                the school. Optio Academy does not discriminate on the basis of race, color, or national
                origin in administration of its educational policies, admissions policies, scholarship and
                loan programs, or other school-administered programs.
              </p>
              <p className="mb-4 text-sm text-gray-600">
                Optio Academy complies with the antidiscrimination provisions of Title VI of the Civil
                Rights Act of 1964, 42 U.S.C. §2000d.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Tuition, Fees, and Refund Policy</h2>

              <h3 className="text-xl font-semibold mb-3">Annual Tuition</h3>
              <p className="mb-4">
                Annual tuition for Optio Academy is $8,000 per Participant per school year. Tuition
                includes daily 1-on-1 mentor sessions, all curriculum materials, access to the Optio
                digital platform, the Participant's transcript, and the diploma pathway.
              </p>

              <h3 className="text-xl font-semibold mb-3">No Additional Required Fees</h3>
              <p className="mb-4">
                There are no required additional fees during the school year. No enrollment fee, no
                materials fee, no technology fee, no testing fee.
              </p>

              <h3 className="text-xl font-semibold mb-3">Tuition Parity</h3>
              <p className="mb-4">
                Tuition, fees, and refund terms for Participants whose tuition is funded by a scholarship
                or other third-party program are identical to those for Participants paying tuition
                directly. The Academy does not charge scholarship-funded Participants more than
                non-scholarship Participants for the same program.
              </p>

              <h3 className="text-xl font-semibold mb-3">Refund Policy</h3>
              <p className="mb-4">
                If the Participant withdraws from Optio Academy before the end of the school year, tuition
                is refunded prorated by the number of months the Participant attended. Months in which the
                Participant was enrolled for any part of the month count as a full attended month for
                purposes of this calculation.
              </p>

              <h3 className="text-xl font-semibold mb-3">Refunds for Scholarship-Funded Tuition</h3>
              <p className="mb-4">
                If a Participant's tuition was funded in whole or in part by the Utah Fits All Scholarship
                Program or any other government or third-party scholarship program, any refund owed under
                this policy is remitted directly to the program manager or financial administrator of
                that program for redeposit into the Participant's scholarship account, in accordance with
                that program's rules. Refunds are not remitted to the Parent or Participant in such cases,
                except where the program's own rules require otherwise.
              </p>

              <h3 className="text-xl font-semibold mb-3">No Rebates or Pass-Throughs</h3>
              <p className="mb-4">
                The Academy does not refund, rebate, or otherwise share scholarship funds with the Parent
                or Participant outside the financial-administrator channel established by the applicable
                scholarship program. The Academy does not pay commissions, kickbacks, or other inducements
                to families in exchange for enrollment.
              </p>

              <h3 className="text-xl font-semibold mb-3">Payment Processing</h3>
              <p className="mb-4">
                Tuition payments are processed through Stripe or, where applicable, through the financial
                administrator of the scholarship program funding the Participant's tuition. Payment plans
                are available; specific terms are agreed at enrollment.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Pre-Enrollment Disclosure</h2>
              <p className="mb-4">
                Before enrollment is finalized, the Academy provides the Parent and Participant with a
                written pre-enrollment disclosure that includes:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>The educational services offered and their cost (the annual tuition described in Section 4)</li>
                <li>All additional fees, if any, required during the school year (none, as of the Effective Date)</li>
                <li>The skill or grade level of the curriculum offered to the Participant</li>
                <li>The refund and reimbursement policy described in Section 4</li>
                <li>The Participant's right to transfer described in Section 6</li>
              </ul>
              <p className="mb-4">
                The Parent and Participant acknowledge receipt of the pre-enrollment disclosure before
                signing this Agreement.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Right to Transfer; Withdrawal Procedure</h2>

              <h3 className="text-xl font-semibold mb-3">No Waiver of Right to Transfer</h3>
              <p className="mb-4">
                Nothing in this Agreement waives, restricts, or penalizes the Participant's right to
                withdraw from Optio Academy and transfer to another qualifying provider or school during
                the school year. The Academy does not require any Participant to sign a contract,
                addendum, or other document that limits this right.
              </p>

              <h3 className="text-xl font-semibold mb-3">How to Withdraw</h3>
              <p className="mb-4">
                The Parent may withdraw the Participant at any time by providing written notice to{' '}
                <a href="mailto:tanner@optioeducation.com" className="text-primary hover:text-optio-purple underline">
                  tanner@optioeducation.com
                </a>{' '}
                or{' '}
                <a href="mailto:support@optioeducation.com" className="text-primary hover:text-optio-purple underline">
                  support@optioeducation.com
                </a>. The withdrawal takes effect on the date stated in the notice or, if no date is
                stated, on the date the notice is received.
              </p>

              <h3 className="text-xl font-semibold mb-3">Reporting to Scholarship Programs</h3>
              <p className="mb-4">
                For Participants whose tuition is funded by the Utah Fits All Scholarship Program or any
                other scholarship program that requires withdrawal reporting, the Academy reports the
                withdrawal to the program manager within 5 business days of the effective date of
                withdrawal.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Educational Records (FERPA)</h2>
              <p className="mb-4">
                The Participant's educational records are protected under the Family Educational Rights
                and Privacy Act ("FERPA"), 20 U.S.C. §1232g and 34 C.F.R. Part 99. The Academy will not
                disclose personally identifiable information from a Participant's educational records
                without the prior written consent of the Parent (or the Participant, if the Participant
                is 18 or older), except as permitted by FERPA.
              </p>
              <p className="mb-4">
                The Parent (and, for Participants 18 or older, the Participant) has the right to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Inspect and review the Participant's educational records</li>
                <li>Request the amendment of records the Parent believes are inaccurate or misleading</li>
                <li>Consent in writing to disclosures of personally identifiable information, except where FERPA permits disclosure without consent</li>
                <li>File a complaint with the U.S. Department of Education concerning alleged failures by the Academy to comply with FERPA</li>
              </ul>
              <p className="mb-4">
                Further details about how the Academy handles educational records and student data are
                set forth in the{' '}
                <Link to="/privacy" className="text-primary hover:text-optio-purple underline">
                  Privacy Policy
                </Link>.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Health, Safety, and Mandatory Reporting</h2>

              <h3 className="text-xl font-semibold mb-3">Background Checks for Staff</h3>
              <p className="mb-4">
                As a condition of employment or appointment, Optio Academy requires every employee who
                does not hold a current Utah educator license (or current educator license from the
                educator's home state) and every contract employee to undergo nationwide, fingerprint-based
                criminal background checks and ongoing rap-back monitoring before working with students.
              </p>
              <p className="mb-4 text-sm text-gray-600">
                Background checks are conducted in accordance with Utah Code §53G-11-402 and the Adam
                Walsh Child Protection and Safety Act of 2006, Pub. L. 109-248.
              </p>

              <h3 className="text-xl font-semibold mb-3">Mandatory Reporting</h3>
              <p className="mb-4">
                All Optio Academy staff, teachers, and mentors are mandatory reporters of suspected child
                abuse or neglect. Staff are trained to recognize warning signs and are required by law to
                report suspected abuse or neglect to the Utah Department of Child and Family Services
                and, where applicable, to local law enforcement.
              </p>
              <p className="mb-4 text-sm text-gray-600">
                Mandatory reporting is conducted in accordance with Utah Code §62A-4a-403 and §80-2-602.
              </p>

              <h3 className="text-xl font-semibold mb-3">Emergency Contact Information</h3>
              <p className="mb-4">
                The Parent agrees to provide complete and accurate emergency contact information at
                enrollment and to update the Academy immediately of any changes.
              </p>

              <h3 className="text-xl font-semibold mb-3">Online Safety</h3>
              <p className="mb-4">
                The Optio platform uses encrypted connections, secure authentication, and content
                filtering for student-facing AI features. The Parent has full visibility into the
                Participant's account, including AI tutor conversations, through the Parent Dashboard.
                Additional safeguards are described in the{' '}
                <Link to="/privacy" className="text-primary hover:text-optio-purple underline">
                  Privacy Policy
                </Link>.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Media Release and Intellectual Property</h2>

              <h3 className="text-xl font-semibold mb-3">Media Release</h3>
              <p className="mb-4">
                The Parent and Participant grant the Academy permission to use the Participant's image,
                voice, work, and projects in promotional and educational materials. This includes website
                and social media content, marketing materials, online showcases (which may be recorded),
                and educational case studies. All such use will be for non-commercial educational and
                promotional purposes. The Parent may opt out at any time by contacting{' '}
                <a href="mailto:tanner@optioeducation.com" className="text-primary hover:text-optio-purple underline">
                  tanner@optioeducation.com
                </a>.
              </p>

              <h3 className="text-xl font-semibold mb-3">Intellectual Property</h3>
              <p className="mb-4">
                The intellectual property of the Participant's projects, creations, and any business
                ventures the Participant pursues belongs to the Participant (or, if applicable, the
                Participant's legal entity). The Participant grants the Academy a non-exclusive,
                royalty-free license to display the Participant's work for non-commercial educational
                and promotional purposes only.
              </p>

              <h3 className="text-xl font-semibold mb-3">Third-Party Technology</h3>
              <p className="mb-4">
                The Parent authorizes the Academy to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Provide the Participant access to the Optio digital learning platform</li>
                <li>Use approved third-party educational software as needed for the program</li>
                <li>Create accounts on behalf of Participants under 13 with parental consent under COPPA</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Code of Conduct</h2>
              <p className="mb-4">
                Optio Academy is a respectful, safe, and professional learning environment. Bullying,
                harassment, and discrimination of any kind are not tolerated, including but not limited
                to discrimination based on race, color, national origin, religion, sex, gender identity,
                sexual orientation, disability, or any other protected characteristic. Violations may
                result in disciplinary action up to and including termination of enrollment.
              </p>
              <p className="mb-4">
                Detailed behavioral expectations are set forth in the{' '}
                <Link to="/academy-handbook" className="text-primary hover:text-optio-purple underline">
                  Academy Handbook
                </Link>.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Online Showcases</h2>
              <p className="mb-4">
                Several times per year, the Academy hosts online showcases where Participants present
                their work to the community, mentors, and family members. Participation is strongly
                encouraged but not required for academic credit. Showcases may be recorded for
                educational and promotional purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. Disclaimers and Limitations of Liability</h2>
              <p className="mb-4">
                The Academy provides a personalized educational program and mentorship; it does not
                guarantee specific academic outcomes, college admission, employment, or any other future
                result. Continued enrollment requires good-faith engagement by the Participant.
              </p>
              <p className="mb-4">
                On behalf of themselves and their estate, the Parent releases and agrees not to sue the
                Academy, its officers, employees, mentors, contractors, or agents for any loss or damage
                arising from the Participant's participation in Optio Academy, except for loss or damage
                caused by the Academy's gross negligence, reckless misconduct, or intentional wrongdoing.
              </p>
              <p className="mb-4">
                The Parent expressly acknowledges and understands that, in accordance with Utah public
                policy, this Agreement does not and cannot waive or release any legal claim the
                Participant (as a minor) may have against the Academy for injuries caused by the
                Academy's own negligence.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">13. Indemnification</h2>
              <p className="mb-4">
                The Parent agrees to indemnify, defend, and hold harmless the Academy from any claims,
                lawsuits, damages, and expenses (including reasonable attorneys' fees) arising from the
                Participant's violation of this Agreement, the Participant's violation of any law, or the
                Participant's User Content submitted to the Service, except for claims caused by the
                Academy's gross negligence or willful misconduct.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">14. Dispute Resolution</h2>
              <p className="mb-4">
                Any dispute arising from this Agreement will first be addressed through good-faith
                informal discussion between the parties. If the dispute cannot be resolved informally,
                it shall be submitted to mediation in Utah County, Utah.
              </p>
              <p className="mb-4">
                If mediation fails to resolve the dispute, it will be resolved through individual, final,
                and binding arbitration in Utah County, Utah, under the rules of the American Arbitration
                Association. By signing this Agreement, the Parent waives the right to a jury trial and
                the right to participate in a class-action lawsuit.
              </p>
              <p className="mb-4">
                This dispute resolution provision does not limit any rights provided by law to parents or
                guardians of minor students, including the right of the minor Participant to bring claims
                for injuries caused by the Academy's negligence.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">15. Modification of Agreement</h2>
              <p className="mb-4">
                The Academy reserves the right to amend or modify this Agreement and the incorporated
                Handbook at any time. The Academy will provide notice of any material change to the
                Parent's primary email address on file. Continued participation in the program after
                such notice constitutes acceptance of the modified terms. Tuition and refund terms for
                the current school year may not be changed retroactively.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">16. Termination</h2>
              <p className="mb-4">
                The Academy may terminate the Participant's enrollment for cause, including but not
                limited to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Material violation of this Agreement or the Handbook</li>
                <li>Bullying, harassment, discrimination, or other Code of Conduct breach</li>
                <li>Non-payment of tuition where tuition is paid directly</li>
                <li>Sustained lack of engagement after written notice and opportunity to remedy</li>
                <li>Safety concerns</li>
                <li>A good-faith determination by the Academy that continued enrollment is no longer a suitable fit</li>
              </ul>
              <p className="mb-4">
                The Parent may withdraw the Participant at any time as described in Section 6. Tuition
                refunds upon termination are governed by Section 4.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">17. Entire Agreement and Severability</h2>
              <p className="mb-4">
                This written Agreement, together with the{' '}
                <Link to="/academy-handbook" className="text-primary hover:text-optio-purple underline">
                  Academy Handbook
                </Link>,{' '}
                <Link to="/terms" className="text-primary hover:text-optio-purple underline">
                  Terms of Service
                </Link>, and{' '}
                <Link to="/privacy" className="text-primary hover:text-optio-purple underline">
                  Privacy Policy
                </Link>, constitutes the entire agreement between the parties on the subject matter
                hereof. All prior verbal promises of whatever kind are merged herein.
              </p>
              <p className="mb-4">
                If any provision of this Agreement is found unenforceable or invalid, that provision will
                be limited or eliminated to the minimum extent necessary so that the remainder of this
                Agreement remains in full force and effect.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">18. Acknowledgment</h2>
              <p className="mb-4">
                By enrolling in Optio Academy, the undersigned Participant and Parent(s)/Legal Guardian(s)
                affirm that they have read this entire Agreement, have had the opportunity to ask
                questions, and agree to be legally bound by all its terms.
              </p>
              <p className="mb-4 font-semibold">
                The parties specifically acknowledge that they have read, understood, and agreed to the
                following sections:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>Section 4:</strong> Tuition, Fees, and Refund Policy</li>
                <li><strong>Section 6:</strong> Right to Transfer; Withdrawal Procedure</li>
                <li><strong>Section 8:</strong> Health, Safety, and Mandatory Reporting</li>
                <li><strong>Section 12:</strong> Disclaimers and Limitations of Liability</li>
                <li><strong>Section 14:</strong> Dispute Resolution</li>
                <li><strong>Section 16:</strong> Termination</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">19. Contact</h2>
              <p className="mb-4">
                If you have any questions about this Agreement, please contact:
              </p>
              <p className="mb-4">
                <strong>Optio Academy</strong><br />
                Dr. Tanner Bowman, Head of School<br />
                Optio, LLC<br />
                1555 Freedom Blvd 200 W<br />
                Provo, UT 84604<br />
                <br />
                <strong>Email:</strong> tanner@optioeducation.com<br />
                <strong>General support:</strong> support@optioeducation.com<br />
                <strong>Website:</strong> https://www.optioeducation.com
              </p>
            </section>

            <div className="bg-gray-100 p-6 rounded-lg mt-8">
              <p className="text-sm text-gray-700 mb-4">
                <strong>Note:</strong> This Agreement must be signed electronically before the
                Participant begins enrollment in Optio Academy. Users of the Optio digital platform who
                are not enrolled in Optio Academy are not required to sign this Agreement but must agree
                to the{' '}
                <Link to="/terms" className="text-primary hover:text-optio-purple underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-primary hover:text-optio-purple underline">
                  Privacy Policy
                </Link>.
              </p>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <Link to="/register" className="text-primary hover:text-optio-purple font-medium">
              ← Back to Registration
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OptioAcademyAgreement
