import React from 'react'
import { Link } from 'react-router-dom'

const OptioAcademyHandbook = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Optio Academy Participant Handbook</h1>

          <div className="prose prose-gray max-w-none">
            <p className="text-sm text-gray-600 mb-6">Effective Date: May 22, 2026</p>

            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-l-4 border-optio-purple p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Welcome to Optio Academy!</h3>
              <p className="text-gray-700">
                This handbook walks you through how Optio Academy works day-to-day. It's the companion to
                the{' '}
                <Link to="/academy-agreement" className="text-primary hover:text-optio-purple underline">
                  Participant &amp; Parent Agreement
                </Link>
                . Read it once at enrollment, then keep it as a reference whenever you have a question
                about how something works.
              </p>
            </div>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Our Philosophy</h2>
              <p className="mb-4">
                Optio Academy is built around one idea: you do your best work when you're in control. We
                provide the curriculum, the daily mentorship, and the platform. The drive and the
                ownership come from you. This program is for self-directed students who are ready to be
                responsible for their own learning.
              </p>
              <p className="mb-4 font-semibold text-optio-purple">
                "The Process Is The Goal"
              </p>
              <p className="mb-4">
                At Optio Academy, learning matters in the present, not just for some future payoff. Every
                quest you pursue, every mistake you make, every skill you build — those matter right now.
                You're not here to impress anyone. You're here to discover what you're capable of and
                enjoy the journey.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">How Optio Academy Works</h2>

              <h3 className="text-xl font-semibold mb-3">Fully Online</h3>
              <p className="mb-4">
                Optio Academy is a fully online private school. There is no campus and no in-person
                requirement. Everything happens through the Optio platform and a daily video session with
                your dedicated teacher.
              </p>

              <h3 className="text-xl font-semibold mb-3">Your Daily Mentor Session</h3>
              <p className="mb-4">
                Every weekday, you meet with the same dedicated teacher one-on-one over video. Together,
                you'll:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Set goals for the day or week</li>
                <li>Review yesterday's work</li>
                <li>Learn new concepts and work through challenges</li>
                <li>Plan your next quest or project</li>
                <li>Assess progress against the five skill pillars</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Quest-Based Learning</h3>
              <p className="mb-4">
                Between mentor sessions, you work on personalized "quests" — projects that turn your
                interests into real coursework. The Optio platform tracks everything:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>Quests:</strong> Project-based learning challenges you choose with your teacher</li>
                <li><strong>Tasks:</strong> Personalized steps within each quest that guide your work</li>
                <li><strong>Evidence:</strong> Documentation of your learning through images, videos, documents, and reflections</li>
                <li><strong>XP (Experience Points):</strong> Progress tracking across the five skill pillars</li>
                <li><strong>Badges:</strong> Recognition of mastery in specific areas</li>
                <li><strong>Diploma &amp; Portfolio:</strong> Your public showcase of learning achievements</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Five Skill Pillars</h3>
              <p className="mb-4">
                Your coursework covers five interconnected pillars, aligned with Utah core high school
                standards:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>STEM:</strong> Science, Technology, Engineering, Mathematics</li>
                <li><strong>Communication:</strong> Writing, speaking, language arts, storytelling</li>
                <li><strong>Civics:</strong> Social studies, government, history, community</li>
                <li><strong>Wellness:</strong> Physical education, health, mental health, personal development</li>
                <li><strong>Art:</strong> Creative expression, design, music, performance</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">The School Year</h3>
              <p className="mb-4">
                The Optio Academy school year starts September 1 and runs through late May. Holidays,
                breaks, and the specific calendar are published before the school year begins and updated
                in your account.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Code of Conduct</h2>

              <h3 className="text-xl font-semibold mb-3">Own Your Learning</h3>
              <p className="mb-4">
                Your progress is up to you. We expect you to show up to your mentor sessions, do the work
                between sessions, and ask for help when you're stuck. If you stop engaging, your teacher
                will reach out — and so will your parents.
              </p>

              <h3 className="text-xl font-semibold mb-3">Respect Everyone</h3>
              <p className="mb-4">
                Optio Academy is a safe, professional space for every student. Bullying, harassment, and
                discrimination of any kind are not tolerated — in mentor sessions, on showcases, in chat,
                or anywhere else in the Optio community. This includes:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Verbal or written harassment</li>
                <li>Discrimination based on race, color, national origin, religion, sex, gender identity, sexual orientation, disability, or any other protected characteristic</li>
                <li>Cyberbullying or harassment through chat, video, or other digital platforms</li>
                <li>Inappropriate jokes, comments, or images</li>
                <li>Exclusionary behavior</li>
              </ul>
              <p className="mb-4">
                Violations can result in disciplinary action up to and including termination of
                enrollment.
              </p>

              <h3 className="text-xl font-semibold mb-3">Be Honest</h3>
              <p className="mb-4">
                The portfolio you build is yours. Submit your own work. If you used AI, a tutor, or
                another resource to help, say so in your evidence — that's part of how real learning gets
                documented. Plagiarism or falsified evidence is a Code of Conduct violation.
              </p>

              <h3 className="text-xl font-semibold mb-3">Show Up Like It's Real School</h3>
              <p className="mb-4">
                Because it is. Show up to your mentor session on time. Have your work ready. Be present.
                Dress appropriately for video. Treat your teacher and other students with professional
                respect.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Safety &amp; Mandatory Reporting</h2>

              <h3 className="text-xl font-semibold mb-3">Your Teachers Are Mandatory Reporters</h3>
              <p className="mb-4">
                Every Optio Academy teacher and mentor is a mandatory reporter. By law, if a staff member
                sees a sign that a student may be in danger — abuse, neglect, self-harm, or harm to
                others — they are required to report it to the proper authorities. This is true even if
                the student asks them not to. We tell you this so you know: you are looked after.
              </p>

              <h3 className="text-xl font-semibold mb-3">If You're in Crisis</h3>
              <p className="mb-4">
                If you are in immediate danger, call 911. If you are in crisis but not in immediate
                danger, you can also reach the 988 Suicide &amp; Crisis Lifeline by dialing or texting
                988. Tell your teacher as soon as you are able — they can help you and your family find
                support.
              </p>

              <h3 className="text-xl font-semibold mb-3">If You See Something, Say Something</h3>
              <p className="mb-4">
                If you witness bullying, harassment, or any behavior that makes you or another student
                feel unsafe, tell your teacher or email{' '}
                <a href="mailto:tanner@optioeducation.com" className="text-primary hover:text-optio-purple underline">
                  tanner@optioeducation.com
                </a>
                . Reports are taken seriously and investigated promptly.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Online Safety &amp; Privacy</h2>

              <h3 className="text-xl font-semibold mb-3">Your Account</h3>
              <p className="mb-4">
                Keep your password private. Don't share your login with friends, classmates, or even
                family members outside your parent or guardian. If you think someone else has access to
                your account, tell your teacher right away.
              </p>

              <h3 className="text-xl font-semibold mb-3">What's Public, What's Not</h3>
              <p className="mb-4">
                Your portfolio is public by default — that's how colleges, employers, and family can see
                what you've learned. You can change visibility settings at any time on your Profile page.
                Your mentor sessions, your private notes, and your AI tutor conversations are not public.
              </p>

              <h3 className="text-xl font-semibold mb-3">The AI Study Buddy</h3>
              <p className="mb-4">
                Optio's AI study buddy is content-filtered for K – 12 use, and every conversation is
                logged and visible to your parents through the Parent Dashboard. It's a great tool for
                getting unstuck — use it. Just remember: it's a study aid, not a replacement for actually
                doing the work.
              </p>

              <h3 className="text-xl font-semibold mb-3">Your Data</h3>
              <p className="mb-4">
                We never sell student data. Full details on what we collect, how it's used, and your
                rights live in the{' '}
                <Link to="/privacy" className="text-primary hover:text-optio-purple underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Online Showcases</h2>
              <p className="mb-4">
                A few times each school year, the Academy hosts online showcases where students present
                their work to the broader community. These events are a chance to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Share what you've been building</li>
                <li>Get feedback from mentors, families, and other students</li>
                <li>Practice public speaking and presentation skills</li>
                <li>See what your peers are creating</li>
              </ul>
              <p className="mb-4">
                Participation is strongly encouraged but not required for academic credit. Showcases may
                be recorded for educational and promotional purposes. If you'd rather not appear in a
                recording, let your teacher know.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Tuition &amp; Refunds</h2>
              <p className="mb-4">
                Optio Academy charges a single annual tuition of $8,000 per student, billed on the
                schedule agreed at enrollment. Tuition includes daily mentor sessions, curriculum
                materials, the Optio platform, and the diploma pathway. There are no required additional
                fees during the school year.
              </p>
              <p className="mb-4">
                If a student leaves before the end of the school year, tuition is refunded prorated by
                the number of months attended. The full refund policy — including how refunds work for
                students whose tuition is funded by a scholarship — is in Section 4 of the{' '}
                <Link to="/academy-agreement" className="text-primary hover:text-optio-purple underline">
                  Academy Agreement
                </Link>
                .
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Withdrawing &amp; Transferring</h2>
              <p className="mb-4">
                If Optio Academy isn't the right fit, you're free to leave at any time and transfer to
                another school. Optio does not require any contract or signature that limits this right.
                Your parent or guardian withdraws you by emailing{' '}
                <a href="mailto:tanner@optioeducation.com" className="text-primary hover:text-optio-purple underline">
                  tanner@optioeducation.com
                </a>
                . We send your transcript and any portfolio records to your new school on request.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">What We Provide vs. What We Expect</h2>

              <h3 className="text-xl font-semibold mb-3">What We Provide</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>A dedicated teacher who meets with you every weekday</li>
                <li>The Optio digital learning platform</li>
                <li>Personalized curriculum across the five skill pillars</li>
                <li>An AI study buddy for between-session help</li>
                <li>Online showcases and a community of fellow students</li>
                <li>An accredited diploma pathway (accreditation in progress for 2026 – 2027)</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">What We Expect From You</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Show up to your daily mentor sessions</li>
                <li>Do the work between sessions, honestly</li>
                <li>Ask for help when you're stuck — that's what mentors are for</li>
                <li>Treat everyone in the Optio community with respect</li>
                <li>Take responsibility for your own learning</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">When the Academy Isn't a Good Fit</h3>
              <p className="mb-4">
                This program asks for a higher level of self-direction than a traditional school. Not
                everyone thrives in it, and that's okay. The Academy may end an enrollment if there are
                serious Code of Conduct violations, sustained lack of engagement after support has been
                offered, safety concerns, or non-payment of tuition where tuition is paid directly. Full
                termination provisions are in Section 16 of the{' '}
                <Link to="/academy-agreement" className="text-primary hover:text-optio-purple underline">
                  Academy Agreement
                </Link>
                .
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Getting Help</h2>

              <h3 className="text-xl font-semibold mb-3">Your Teacher</h3>
              <p className="mb-4">
                Your teacher is your first stop for almost anything: academic questions, planning your
                next quest, getting feedback, navigating the platform. Bring it to your daily session, or
                message them between sessions.
              </p>

              <h3 className="text-xl font-semibold mb-3">Head of School</h3>
              <p className="mb-4">
                For bigger issues — concerns about safety, conduct, fit, billing — contact Dr. Tanner
                Bowman, Head of School, at{' '}
                <a href="mailto:tanner@optioeducation.com" className="text-primary hover:text-optio-purple underline">
                  tanner@optioeducation.com
                </a>
                .
              </p>

              <h3 className="text-xl font-semibold mb-3">Technical Support</h3>
              <p className="mb-4">
                For platform bugs, login problems, or general technical issues, email{' '}
                <a href="mailto:support@optioeducation.com" className="text-primary hover:text-optio-purple underline">
                  support@optioeducation.com
                </a>
                .
              </p>
            </section>

            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-l-4 border-optio-purple p-6 mt-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Welcome to Your Learning Adventure!</h3>
              <p className="text-gray-700 mb-4">
                You're part of something new at Optio Academy. You have the freedom to design your
                education around what you actually care about — with a teacher in your corner every day.
                This is your journey. Make it meaningful, make it your own, and enjoy the process.
              </p>
              <p className="text-gray-700 font-semibold">
                Remember: The process is the goal. Celebrate your growth right now, not just what it
                might lead to later.
              </p>
            </div>

            <div className="bg-gray-100 p-6 rounded-lg mt-8">
              <p className="text-sm text-gray-700 mb-4">
                <strong>Contact Information:</strong>
              </p>
              <p className="text-sm text-gray-700">
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
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200 flex justify-between items-center">
            <Link to="/register" className="text-primary hover:text-optio-purple font-medium">
              ← Back to Registration
            </Link>
            <Link
              to="/academy-agreement"
              className="text-primary hover:text-optio-purple font-medium"
            >
              View Full Academy Agreement →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OptioAcademyHandbook
