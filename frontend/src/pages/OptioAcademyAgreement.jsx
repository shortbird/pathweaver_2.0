import React from 'react'
import { Link } from 'react-router-dom'

const OptioAcademyAgreement = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Optio Academy Participant & Parent Agreement</h1>

          <div className="prose prose-gray max-w-none">
            <p className="text-sm text-gray-600 mb-6">Effective Date: January 27, 2025</p>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-8">
              <p className="font-semibold text-blue-900">Important Notice</p>
              <p className="text-sm text-blue-800 mt-2">
                This Agreement is required for all participants in the Optio Academy in-person program.
                Digital-only users of the Optio platform do not need to sign this Agreement.
              </p>
            </div>

            <section className="mb-8">
              <p className="mb-4">
                This Participant & Parent Agreement ("Agreement") is a legally binding contract entered into
                by and between:
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
                  K-12 Student enrolling in Optio Academy<br />
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
              <h2 className="text-2xl font-semibold mb-4">1. Introduction and Core Philosophy</h2>
              <p className="mb-4">
                This Agreement governs the Participant's enrollment in Optio Academy, our in-person educational
                program located in Provo, Utah. Its purpose is to create a clear understanding of the Academy's
                unique model, mutual responsibilities, financial commitments, and operational policies.
              </p>
              <p className="mb-4">
                Optio Academy operates on the philosophy of a "liberated environment with firm boundaries."
                We provide access to facilities, mentorship, the Optio digital learning platform, and a
                framework for entrepreneurial development. We do not provide direct supervision or assume
                custodial care. The Participant is expected to be self-motivated and take primary responsibility
                for their success.
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
              <h2 className="text-2xl font-semibold mb-4">2. The "Open Campus" Model and Acknowledgment of No Supervision</h2>
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
                <p className="font-semibold text-yellow-900">CRITICAL SECTION - Please Read Carefully</p>
                <p className="text-sm text-yellow-800 mt-2">
                  This section is essential to understanding the Academy's operating model and your responsibilities.
                </p>
              </div>

              <p className="mb-4">
                By signing this Agreement, you explicitly acknowledge and agree to the following terms:
              </p>

              <h3 className="text-xl font-semibold mb-3">Innovation Center Model</h3>
              <p className="mb-4">
                The Academy is structured similarly to a recreational or innovation center. The Participant
                is paying for access to the facilities, resources, digital learning platform, and the opportunity
                to interact with staff and mentors.
              </p>

              <h3 className="text-xl font-semibold mb-3">No Supervision or Custodial Care</h3>
              <p className="mb-4">
                Optio Academy DOES NOT provide childcare, babysitting, or custodial supervision for any
                Participant, regardless of age. Staff and mentors are present to provide educational and
                entrepreneurial guidance through the Optio platform and in-person mentorship, not to monitor
                or supervise Participants.
              </p>

              <h3 className="text-xl font-semibold mb-3">Freedom of Movement - Open Campus</h3>
              <p className="mb-4">
                The Academy operates as an OPEN CAMPUS. Participants are free to arrive, depart, and move
                about the premises and surrounding areas at will during program hours.
              </p>

              <h3 className="text-xl font-semibold mb-3">No Monitoring of Arrival or Departure</h3>
              <p className="mb-4">
                Academy staff DO NOT monitor when Participants arrive or leave the facility. We are not
                responsible for ensuring a Participant's attendance on any given day. Participants are
                expected to manage their own time and attendance.
              </p>

              <h3 className="text-xl font-semibold mb-3">Parental Responsibility for Transportation</h3>
              <p className="mb-4">
                Parents are solely responsible for the Participant's transportation to and from the facility.
                The Academy DOES NOT verify the identity of the person picking up a Participant. It is the
                Parent's responsibility to coordinate safe transportation and communicate authorized persons
                directly with their child.
              </p>

              <h3 className="text-xl font-semibold mb-3">Actions Outside the Academy</h3>
              <p className="mb-4">
                The Academy is not responsible for the Participant's actions or safety when they are off-site,
                even if they leave during normal operating hours. Students have the freedom to leave the
                premises as part of the open campus model.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. Program Description and Educational Model</h2>

              <h3 className="text-xl font-semibold mb-3">Program Structure</h3>
              <p className="mb-4">
                Optio Academy combines in-person mentorship with our digital learning platform. The program:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Meets one full day per week at our Provo, Utah location</li>
                <li>Uses the Optio digital platform for quest-based learning with personalized tasks</li>
                <li>Focuses on project-based learning across five skill pillars (STEM, Wellness, Communication, Civics, Art)</li>
                <li>Emphasizes business venture creation and entrepreneurial development</li>
                <li>Provides access to makerspace equipment and professional tools</li>
                <li>Includes mentor guidance and community events like Showcase Nights</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Accredited Program</h3>
              <p className="mb-4">
                Optio Academy is an accredited program that offers pathways for students to earn recognized
                educational credentials. Students work through quests and document their learning to build
                portfolios and earn badges toward their diploma.
              </p>

              <h3 className="text-xl font-semibold mb-3">Educational Philosophy: "The Process Is The Goal"</h3>
              <p className="mb-4">
                Optio Academy embraces the philosophy that learning is valued for its intrinsic worth and
                the growth it creates in the present moment. Students are encouraged to focus on their
                learning journey, creativity, and personal development rather than solely on external outcomes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Program Fee, Payment, and Scholarship Information</h2>

              <h3 className="text-xl font-semibold mb-3">Monthly Program Fee</h3>
              <p className="mb-4">
                The monthly fee for Optio Academy is $300 per month, which includes:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>One full day per week of in-person learning at the Provo facility</li>
                <li>Access to the Optio digital learning platform</li>
                <li>Mentorship and educational guidance</li>
                <li>Use of makerspace equipment and resources (with safety training)</li>
                <li>Participation in Showcase Nights and community events</li>
                <li>Access to accredited curriculum and diploma pathway</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Utah Education Fits All (UEFA) Scholarship</h3>
              <p className="mb-4">
                Optio Academy is an approved provider for the Utah Education Fits All scholarship program.
                Eligible Utah students may use their UEFA scholarship funds to pay for program enrollment.
                Parents should apply directly through the Utah State Board of Education's UEFA program.
              </p>

              <h3 className="text-xl font-semibold mb-3">Sponsor-Subsidized Model</h3>
              <p className="mb-4">
                Optio Academy operates through a combination of participant fees and sponsor support. The
                $300 monthly fee is partially subsidized by generous sponsors who believe in our mission.
                This model only works if we can demonstrate value to our sponsors.
              </p>
              <p className="mb-4">
                Participants and families share responsibility for the Academy's sustainability:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>Professionalism:</strong> Your conduct directly reflects on the Academy and its viability</li>
                <li><strong>Quality of Work:</strong> Your projects are our primary results and justify sponsor investment</li>
                <li><strong>Sponsor Sourcing:</strong> Participants are encouraged to help identify potential sponsors as part of learning entrepreneurship</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Payment Terms</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Enrollment is month-to-month with no long-term contract required</li>
                <li>Fees are billed in advance on a recurring monthly basis</li>
                <li>Payment is processed through Stripe payment processing</li>
                <li>Cancellation may be made at any time with written notice</li>
                <li>Cancellations take effect at the end of the current billing period</li>
                <li>All fees are non-refundable unless otherwise stated or required by law</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">No Guarantee of Outcomes</h3>
              <p className="mb-4">
                The Academy provides tools, mentorship, and a framework to support student entrepreneurs
                and learners. However, the Academy makes no warranty or guarantee of any specific business
                outcome, educational result, or future success, notwithstanding any optimism or assurances
                that the Participant or Parent receives from any Academy mentor or staff.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Participant's Business Entity (Optional)</h2>

              <h3 className="text-xl font-semibold mb-3">Business Entity Formation</h3>
              <p className="mb-4">
                Should the Participant choose to formalize their business venture into a legal entity
                (LLC, corporation, etc.), the Parent and Participant acknowledge that they are solely
                responsible for the process, cost, and administration of formation and maintenance.
                The Academy does not require formation of a business entity for program participation.
              </p>

              <h3 className="text-xl font-semibold mb-3">Academy is Not a Partner</h3>
              <p className="mb-4">
                The Academy is an educational service provider and is not a partner, owner, investor, or
                fiduciary of the Participant or Participant's business. All intellectual property created
                by the Participant belongs to the Participant (see Section 7).
              </p>

              <h3 className="text-xl font-semibold mb-3">Business Liabilities</h3>
              <p className="mb-4">
                Should a business be formed, the Parent and Participant are solely responsible for all
                its legal, financial, tax, and operational liabilities. The Academy provides educational
                guidance only and is not a legal, tax, or financial advisor. Participants are encouraged
                to seek independent professional advice.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Health, Safety, and Emergency Procedures</h2>

              <h3 className="text-xl font-semibold mb-3">Health Information</h3>
              <p className="mb-4">
                The Parent agrees to provide complete and accurate Participant health information during
                enrollment and to update the Academy immediately of any changes that may affect the
                Participant's safety or ability to participate.
              </p>

              <h3 className="text-xl font-semibold mb-3">Emergency Medical Authorization</h3>
              <p className="mb-4">
                In the event of a medical emergency where the Parent cannot be reached after reasonable
                attempts, the Parent grants the Academy permission to seek and obtain emergency medical
                treatment for the Participant. The Parent agrees to assume full financial responsibility
                for any and all costs of emergency medical care and transportation.
              </p>

              <h3 className="text-xl font-semibold mb-3">Makerspace Safety</h3>
              <p className="mb-4">
                The Academy facility includes a makerspace with professional-grade equipment including
                but not limited to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>3D printers</li>
                <li>Plasma cutter</li>
                <li>Cricut machines</li>
                <li>Other fabrication and creation tools</li>
              </ul>
              <p className="mb-4">
                Participants must complete mandatory safety training for each piece of equipment before
                they are authorized to use it. Participants agree to follow all safety protocols and
                use equipment only as trained.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Media Release, Intellectual Property, and Technology Consent</h2>

              <h3 className="text-xl font-semibold mb-3">Media Release</h3>
              <p className="mb-4">
                The Parent and Participant grant the Academy permission to use the Participant's image,
                voice, work, and projects in promotional and educational materials without compensation.
                This includes but is not limited to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Website and social media content</li>
                <li>Marketing and promotional materials</li>
                <li>Showcase Night presentations and recordings</li>
                <li>Educational case studies and examples</li>
                <li>Sponsor reports and presentations</li>
              </ul>
              <p className="mb-4">
                All such use will be for non-commercial educational purposes. You may opt out by contacting
                support@optioeducation.com.
              </p>

              <h3 className="text-xl font-semibold mb-3">Intellectual Property</h3>
              <p className="mb-4">
                The intellectual property of the Participant's business, projects, and creations belongs
                to the Participant or their business entity. The Participant grants the Academy a non-exclusive,
                royalty-free license to showcase the Participant's work for non-commercial, educational,
                and promotional purposes only.
              </p>

              <h3 className="text-xl font-semibold mb-3">Third-Party Technology and Digital Platform</h3>
              <p className="mb-4">
                The Parent authorizes the Academy to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Provide access to the Optio digital learning platform</li>
                <li>Use approved third-party educational and business software/platforms as needed for the program</li>
                <li>Create accounts on behalf of Participants under 13 (with parental consent per COPPA)</li>
                <li>Share Participant work and progress through the digital platform</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Assumption of Risk, Waiver, and Indemnification</h2>

              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                <p className="font-semibold text-red-900">Important Legal Notice</p>
                <p className="text-sm text-red-800 mt-2">
                  This section contains important information about assumption of risk and liability.
                  Please read carefully.
                </p>
              </div>

              <h3 className="text-xl font-semibold mb-3">Acknowledgment and Assumption of Inherent Risks</h3>
              <p className="mb-4">
                The Parent and Participant acknowledge that participation in Optio Academy carries inherent
                risks. These risks include, but are not limited to, those arising from:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>The unsupervised, open campus environment</li>
                <li>Use of makerspace tools and equipment (3D printers, plasma cutter, Cricut machines, etc.)</li>
                <li>Interaction with other participants and members of the public</li>
                <li>Transportation to and from the facility</li>
                <li>The freedom of the Participant to leave the premises at any time</li>
                <li>Working on business ventures and entrepreneurial projects</li>
                <li>Use of digital technology and online platforms</li>
              </ul>
              <p className="mb-4">
                The Parent and Participant knowingly and voluntarily assume all such inherent risks,
                both known and unknown.
              </p>

              <h3 className="text-xl font-semibold mb-3">Parental Waiver of Liability (Limited Scope)</h3>
              <p className="mb-4">
                On behalf of themselves (the Parent), their heirs, and their estate, the Parent releases,
                waives, and agrees not to sue the Academy, its officers, employees, mentors, and agents
                for any loss, damage, or injury arising from the inherent risks of participation.
              </p>

              <h3 className="text-xl font-semibold mb-3">Utah Law Regarding Minors</h3>
              <p className="mb-4">
                The Parent explicitly acknowledges and understands that, in accordance with Utah public
                policy and law, this agreement DOES NOT AND CANNOT waive or release any legal claim the
                Participant (minor) may have against the Academy for injuries caused by the Academy's
                own NEGLIGENCE.
              </p>
              <p className="mb-4">
                This waiver does not protect the Academy from liability for its gross negligence, reckless
                misconduct, or intentional wrongdoing.
              </p>

              <h3 className="text-xl font-semibold mb-3">Parental Indemnification</h3>
              <p className="mb-4">
                The Parent agrees to indemnify, defend, and hold harmless the Academy from any and all
                claims, lawsuits, and expenses (including attorney's fees) brought by or on behalf of the
                Participant against the Academy related to their participation, except for claims resulting
                from the Academy's own gross negligence or willful misconduct.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Code of Conduct and Community Standards</h2>
              <p className="mb-4">
                Participants are expected to maintain the Academy as a professional and safe learning
                environment. The following standards apply:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>Professional Conduct:</strong> Act with maturity and respect the shared workspace</li>
                <li><strong>Self-Direction:</strong> Take ownership of your learning and project work</li>
                <li><strong>Respect for All:</strong> The Academy must be safe and welcoming; bullying, harassment, and discrimination are not tolerated</li>
                <li><strong>Equipment Care:</strong> Respect and properly use all Academy resources and equipment</li>
                <li><strong>Contribution:</strong> Actively work on quest goals and business ventures</li>
                <li><strong>Community Support:</strong> Help maintain a positive and productive environment for all</li>
              </ul>
              <p className="mb-4">
                Detailed behavioral expectations are outlined in the{' '}
                <Link to="/academy-handbook" className="text-primary hover:text-optio-purple underline">
                  Academy Handbook
                </Link>.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Showcase Nights and Community Events</h2>
              <p className="mb-4">
                Several times per year, the Academy hosts Showcase Nights where Participants present
                their work to the community, receive feedback, and mark their progress. These events:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Are opportunities to share learning journeys and business ventures</li>
                <li>Build presentation and communication skills</li>
                <li>Connect Participants with community members and potential sponsors</li>
                <li>Celebrate the learning process and growth</li>
                <li>May be recorded for educational and promotional purposes</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Dispute Resolution</h2>
              <p className="mb-4">
                Any dispute arising from this Agreement will first be addressed through good-faith informal
                discussion between the parties. If the dispute cannot be resolved informally, it shall be
                submitted to mediation in Utah County, Utah.
              </p>
              <p className="mb-4">
                If mediation fails to resolve the dispute, it will be resolved through individual, final,
                and binding arbitration in Utah County, Utah, under the rules of the American Arbitration
                Association. By signing this Agreement, you waive the right to a jury trial and the right
                to participate in a class-action lawsuit.
              </p>
              <p className="mb-4">
                This dispute resolution provision does not limit any rights provided by law to parents
                or guardians of minor students.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. Modification of Agreement</h2>
              <p className="mb-4">
                The Academy reserves the right to amend or modify this Agreement and the incorporated
                Handbook at any time in its sole discretion. The Academy will provide notice of any
                material changes to the Parent's primary email address on file. Continued participation
                in the program after such notice will constitute acceptance of the modified terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">13. Termination of Participation</h2>
              <p className="mb-4">
                The Academy reserves the right to terminate a Participant's enrollment in the program
                at any time, for any reason, at its sole discretion. Such termination may occur without
                prior notice and may be for reasons including, but not limited to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Violations of the Handbook or this Agreement</li>
                <li>Disruptive behavior or conduct violations</li>
                <li>Non-payment of fees</li>
                <li>Lack of engagement or active participation</li>
                <li>Safety concerns</li>
                <li>Determination that the program is no longer a suitable fit for the Participant</li>
              </ul>
              <p className="mb-4">
                Parents may terminate enrollment at any time by providing written notice to
                support@optioeducation.com. Termination takes effect at the end of the current billing period.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">14. Entire Agreement and Severability</h2>
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
                </Link>, constitutes the entire agreement between the Parties on the subject matter hereof.
                All prior verbal promises of whatsoever kind or nature are merged herein.
              </p>
              <p className="mb-4">
                If any provision of this Agreement is found to be unenforceable or invalid, that provision
                will be limited or eliminated to the minimum extent necessary so that this Agreement will
                otherwise remain in full force and effect.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">15. Acknowledgment of Critical Sections</h2>
              <p className="mb-4">
                By enrolling in Optio Academy, the undersigned Participant and Parent(s)/Legal Guardian(s)
                affirm that they have read this entire Agreement, have had the opportunity to ask questions,
                and agree to be legally bound by all its terms.
              </p>
              <p className="mb-4 font-semibold">
                The parties specifically acknowledge that they have read, understood, and agreed to the
                following critical sections:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>Section 2:</strong> The "Open Campus" Model and Acknowledgment of No Supervision</li>
                <li><strong>Section 4:</strong> Program Fee, Payment, and Scholarship Information</li>
                <li><strong>Section 5:</strong> Participant's Business Entity (Optional)</li>
                <li><strong>Section 8:</strong> Assumption of Risk, Waiver, and Indemnification</li>
                <li><strong>Section 11:</strong> Dispute Resolution</li>
                <li><strong>Section 13:</strong> Termination of Participation</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">16. Contact Information</h2>
              <p className="mb-4">
                If you have any questions about this Agreement, please contact us at:
              </p>
              <p className="mb-4">
                <strong>Optio Academy</strong><br />
                Optio, LLC<br />
                1555 Freedom Blvd 200 W<br />
                Provo, UT 84604<br />
                <br />
                <strong>Email:</strong> support@optioeducation.com<br />
                <strong>Website:</strong> https://optioeducation.com
              </p>
            </section>

            <div className="bg-gray-100 p-6 rounded-lg mt-8">
              <p className="text-sm text-gray-700 mb-4">
                <strong>Note:</strong> This Agreement must be signed electronically or in person before
                participating in Optio Academy. Digital platform users who do not attend the in-person
                program are not required to sign this Agreement but must agree to the{' '}
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
