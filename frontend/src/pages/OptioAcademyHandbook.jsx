import React from 'react'
import { Link } from 'react-router-dom'

const OptioAcademyHandbook = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Optio Academy Participant Handbook</h1>

          <div className="prose prose-gray max-w-none">
            <p className="text-sm text-gray-600 mb-6">Effective Date: January 27, 2025</p>

            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-l-4 border-optio-purple p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Welcome to Optio Academy!</h3>
              <p className="text-gray-700">
                This handbook outlines how things work at Optio Academy. It's not a list of rules to memorize,
                but a guide to the professional culture we're building together. Read it, understand it, and
                help us make this a productive and inspiring environment for everyone.
              </p>
            </div>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Our Philosophy</h2>
              <p className="mb-4">
                Our model is simple: you do your best work when you're in control. We provide the space,
                resources, digital platform, and mentorship. The drive and the ownership must come from you.
                This program is for self-directed people who are ready to be responsible for their own outcomes.
              </p>
              <p className="mb-4 font-semibold text-optio-purple">
                "The Process Is The Goal"
              </p>
              <p className="mb-4">
                At Optio Academy, we celebrate learning for its own sake. Every quest you pursue, every mistake
                you make, every skill you build - these matter RIGHT NOW, not just for some future payoff.
                You're not here to impress anyone. You're here to discover what you're capable of and enjoy
                the journey of creation and growth.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Your Learning Journey</h2>

              <h3 className="text-xl font-semibold mb-3">Quest-Based Learning</h3>
              <p className="mb-4">
                Your education at Optio Academy happens through the Optio digital platform, which uses
                quest-based learning:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>Quests:</strong> Project-based learning challenges you choose based on your interests</li>
                <li><strong>Tasks:</strong> Personalized steps within each quest that guide your work</li>
                <li><strong>Evidence:</strong> Documentation of your learning through images, videos, documents, and reflections</li>
                <li><strong>XP (Experience Points):</strong> Progress tracking across five skill pillars</li>
                <li><strong>Badges:</strong> Recognition of mastery in specific areas</li>
                <li><strong>Diploma & Portfolio:</strong> Your public showcase of learning achievements</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Five Skill Pillars</h3>
              <p className="mb-4">
                Your learning spans five interconnected areas:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>STEM:</strong> Science, Technology, Engineering, Mathematics</li>
                <li><strong>Wellness:</strong> Physical health, mental health, personal development</li>
                <li><strong>Communication:</strong> Writing, speaking, storytelling, persuasion</li>
                <li><strong>Civics:</strong> Community, citizenship, social responsibility, leadership</li>
                <li><strong>Art:</strong> Creative expression, design, music, performance</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Business Ventures</h3>
              <p className="mb-4">
                At Optio Academy, we focus on entrepreneurship. You're encouraged to launch and build a
                real business venture. Your business is YOUR project - you own the ideas, the work, and
                any outcomes. The Academy provides:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Mentorship from experienced entrepreneurs</li>
                <li>Access to makerspace tools and equipment</li>
                <li>Connection to community resources and potential sponsors</li>
                <li>A framework for tracking progress through quests</li>
                <li>Opportunities to present at Showcase Nights</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Academy Life</h2>

              <h3 className="text-xl font-semibold mb-3">Program Schedule</h3>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>Meeting Days:</strong> One full day per week at our Provo, Utah location</li>
                <li><strong>Open Campus:</strong> Arrive and leave as your work requires (see below)</li>
                <li><strong>Self-Paced Work:</strong> Continue quests independently throughout the week via the digital platform</li>
                <li><strong>Showcase Nights:</strong> Several times per year for community presentations</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Code of Conduct</h3>

              <h4 className="text-lg font-semibold mb-2">Own Your Success</h4>
              <p className="mb-4">
                Your progress is up to you. We expect you to be "fully bought-in." This means you are
                actively working on your quest goals because you are internally motivated, not because
                of external pressure. If you're not engaged, this program isn't the right fit.
              </p>

              <h4 className="text-lg font-semibold mb-2">Maintain a Professional Environment</h4>
              <p className="mb-4">
                We share our space with other professionals and community members. You are expected to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Act with maturity and respect</li>
                <li>Use appropriate language and behavior</li>
                <li>Respect shared workspaces and equipment</li>
                <li>Clean up after yourself</li>
                <li>Contribute positively to the community atmosphere</li>
                <li>Dress appropriately for a professional workspace</li>
              </ul>

              <h4 className="text-lg font-semibold mb-2">Respect Everyone</h4>
              <p className="mb-4">
                The Academy must be a safe and professional space for all. Bullying, harassment, and
                discrimination of any kind are not tolerated. This includes:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Verbal or physical harassment</li>
                <li>Discrimination based on race, gender, religion, sexual orientation, or any other characteristic</li>
                <li>Cyberbullying or harassment through digital platforms</li>
                <li>Inappropriate jokes or comments</li>
                <li>Exclusionary behavior</li>
              </ul>
              <p className="mb-4">
                Violations will result in immediate consequences, including possible termination from the program.
              </p>

              <h3 className="text-xl font-semibold mb-3">The Open Campus: Freedom and Responsibility</h3>
              <p className="mb-4 font-semibold text-red-700">
                Important: Please read this section carefully and discuss it with your parents.
              </p>
              <p className="mb-4">
                The Academy is not a traditional school. We trust you to manage yourself, your time,
                and your work. This is what that means day-to-day:
              </p>

              <ul className="list-disc ml-6 mb-4">
                <li><strong>You Are in Charge of You:</strong> We do not provide supervision. Our staff and mentors
                are here to guide your projects, not to monitor your movements or behavior.</li>
                <li><strong>Freedom to Come and Go:</strong> The Academy is an open campus. You are free to arrive
                and leave as your work requires. You may also leave the building during the day.</li>
                <li><strong>We Don't Take Attendance:</strong> Success is measured by your progress and the quality
                of your work, not by hours spent in the building.</li>
                <li><strong>Transportation is Your Responsibility:</strong> You and your parents are responsible for
                your transportation to and from the Academy. We do not verify who picks you up.</li>
                <li><strong>Your Choices Are Your Own:</strong> You are responsible for your actions and your safety,
                especially if you decide to leave the campus during the day.</li>
              </ul>

              <p className="mb-4">
                This freedom is a privilege that comes with responsibility. If you abuse this trust, you
                may lose your spot in the program.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Daily Basics</h2>

              <h3 className="text-xl font-semibold mb-3">Workspace Access</h3>
              <p className="mb-4">
                You have access to the Academy workspace and resources during your scheduled program day.
                This includes:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Shared work tables and seating</li>
                <li>WiFi and internet access</li>
                <li>Makerspace equipment (with proper training)</li>
                <li>Meeting spaces for collaboration</li>
                <li>Presentation areas for practicing and showcasing work</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Food & Drink</h3>
              <p className="mb-4">
                You are responsible for your own meals, drinks, and snacks. There may be a shared refrigerator
                and microwave available, but you must provide and manage your own food. Clean up after yourself.
              </p>

              <h3 className="text-xl font-semibold mb-3">Personal Belongings</h3>
              <p className="mb-4">
                The Academy is not responsible for lost, stolen, or damaged personal items. Please keep
                valuables with you or secured. Do not leave expensive equipment unattended.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Makerspace & Equipment Safety</h2>

              <h3 className="text-xl font-semibold mb-3">Safety Training Required</h3>
              <p className="mb-4">
                Before using ANY makerspace equipment, you MUST complete mandatory safety training specific
                to that equipment. This includes but is not limited to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>3D printers</li>
                <li>Plasma cutter</li>
                <li>Cricut machines</li>
                <li>Power tools</li>
                <li>Other fabrication equipment</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Safety Rules</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Never use equipment you haven't been trained on</li>
                <li>Always follow safety protocols demonstrated in training</li>
                <li>Wear appropriate safety gear (goggles, gloves, etc.) when required</li>
                <li>Report any equipment damage or safety concerns immediately</li>
                <li>Do not attempt repairs on equipment - notify staff</li>
                <li>Keep work areas clean and organized</li>
                <li>Store materials and tools properly after use</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Consequences for Safety Violations</h3>
              <p className="mb-4">
                Safety violations are taken seriously. Consequences may include:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Loss of equipment access</li>
                <li>Required retraining</li>
                <li>Suspension from the Academy</li>
                <li>Termination from the program (for serious or repeated violations)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Health & Emergency Procedures</h2>

              <h3 className="text-xl font-semibold mb-3">In an Emergency</h3>
              <p className="mb-4">
                In a medical emergency, we will use the contact information your parents provided. If
                we cannot reach them, we will get you the necessary medical help. Your parents are
                financially responsible for any emergency medical costs.
              </p>

              <h3 className="text-xl font-semibold mb-3">If You're Not Feeling Well</h3>
              <p className="mb-4">
                If you become ill during your program day, notify a staff member. You are responsible
                for arranging your own transportation home - contact your parents to pick you up.
              </p>

              <h3 className="text-xl font-semibold mb-3">Medications</h3>
              <p className="mb-4">
                If you need to take medication during your program day, you are responsible for managing
                it yourself. Keep medications secure in your personal belongings.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Showcase Nights</h2>
              <p className="mb-4">
                Several times a year, we host Showcase Nights. These are your opportunities to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Present your work and business ventures to the community</li>
                <li>Get direct feedback from mentors, parents, and community members</li>
                <li>Mark your progress and celebrate your growth</li>
                <li>Connect with potential sponsors or customers</li>
                <li>Practice public speaking and presentation skills</li>
                <li>See what other participants are creating</li>
              </ul>
              <p className="mb-4">
                Participation in Showcase Nights is strongly encouraged but not mandatory. These events
                are often recorded for promotional and educational purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">The Funding Model: A Shared Responsibility</h2>

              <h3 className="text-xl font-semibold mb-3">How the Academy is Funded</h3>
              <p className="mb-4">
                Optio Academy operates through a combination of participant fees ($300/month) and sponsor
                support. Many families use the Utah Education Fits All (UEFA) scholarship to cover tuition.
                The sponsor-subsidized model only works if we can demonstrate our value to the people and
                companies who support us.
              </p>

              <h3 className="text-xl font-semibold mb-3">Your Role in Sustainability</h3>
              <p className="mb-4">
                Securing and maintaining funding is a shared responsibility. Here is your role:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>Professionalism:</strong> Our sponsors are investing in a professional environment.
                Your conduct directly reflects on the Academy and its viability.</li>
                <li><strong>Quality of Work:</strong> Your projects and business ventures are our primary results.
                High-quality, ambitious work is the best justification for a sponsor's investment.</li>
                <li><strong>Sponsor Sourcing:</strong> We encourage you to help identify potential sponsors.
                This is part of the entrepreneurial process and develops valuable networking skills.</li>
              </ul>
              <p className="mb-4">
                The bottom line: Our ability to operate depends on demonstrating value to our sponsors
                and community. We all share that responsibility.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Your Work & Your Story</h2>

              <h3 className="text-xl font-semibold mb-3">Your Intellectual Property</h3>
              <p className="mb-4">
                The ideas, businesses, and projects you create belong to YOU. Any intellectual property
                you develop through your work at the Academy is yours to own, protect, and commercialize
                as you see fit.
              </p>
              <p className="mb-4">
                However, you grant the Academy a license to showcase your work for educational and promotional
                purposes. This helps us demonstrate our value to current and future sponsors.
              </p>

              <h3 className="text-xl font-semibold mb-3">Sharing Our Story</h3>
              <p className="mb-4">
                We regularly document and share work from the Academy for promotional purposes. This may
                include using your image, voice, or projects in our marketing materials, website, social
                media, and presentations to sponsors. You may opt out by contacting support@optioeducation.com.
              </p>

              <h3 className="text-xl font-semibold mb-3">Using Online Tools</h3>
              <p className="mb-4">
                We use the Optio digital platform and various online tools for education and business
                development. Your parents have given us permission to create accounts for you on these
                platforms as needed for your learning.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Our Commitment and Yours</h2>

              <h3 className="text-xl font-semibold mb-3">What We Provide</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>A professional workspace and learning environment</li>
                <li>Access to makerspace equipment and tools</li>
                <li>The Optio digital learning platform for quest-based learning</li>
                <li>Mentorship from experienced entrepreneurs and educators</li>
                <li>A framework for developing business ventures</li>
                <li>Community events like Showcase Nights</li>
                <li>Connections to sponsors and community resources</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">What We Expect from You</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Self-direction and internal motivation</li>
                <li>Active engagement with quests and projects</li>
                <li>Professional conduct and respect for others</li>
                <li>Responsibility for your own time, safety, and progress</li>
                <li>Quality work that reflects well on the Academy</li>
                <li>Contribution to a positive community atmosphere</li>
                <li>Honesty and integrity in all your work</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">When the Academy Isn't a Good Fit</h3>
              <p className="mb-4">
                This program requires a high level of motivation and self-direction. Not everyone thrives
                in this environment, and that's okay. We reserve the right to end a participant's
                enrollment if the Academy is no longer a good fit, for reasons including:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Policy violations or code of conduct breaches</li>
                <li>Lack of engagement or active participation</li>
                <li>Disruptive behavior that harms the community</li>
                <li>Safety violations</li>
                <li>Non-payment of program fees</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Getting Help & Asking Questions</h2>

              <h3 className="text-xl font-semibold mb-3">Your Mentors</h3>
              <p className="mb-4">
                Staff and mentors are here to guide your learning and help you solve problems. They are
                NOT here to supervise you or do your work for you. Use them as resources to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Get feedback on your projects</li>
                <li>Learn new skills or techniques</li>
                <li>Work through challenges in your business venture</li>
                <li>Connect with resources and opportunities</li>
                <li>Get help understanding quest requirements</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Digital Platform Support</h3>
              <p className="mb-4">
                For questions about the Optio digital platform, quests, badges, or technical issues,
                email support@optioeducation.com.
              </p>

              <h3 className="text-xl font-semibold mb-3">Questions About This Handbook</h3>
              <p className="mb-4">
                If you have questions about policies, procedures, or anything in this handbook, ask
                a staff member or email support@optioeducation.com.
              </p>
            </section>

            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-l-4 border-optio-purple p-6 mt-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Welcome to Your Learning Adventure!</h3>
              <p className="text-gray-700 mb-4">
                You're part of something special at Optio Academy. You have the freedom to explore your
                interests, build real businesses, and grow your skills in a professional environment.
                This is YOUR journey - make it meaningful, make it your own, and enjoy the process.
              </p>
              <p className="text-gray-700 font-semibold">
                Remember: The process is the goal. Celebrate your growth RIGHT NOW, not just what it
                might lead to later. You're becoming who you want to be, one quest at a time.
              </p>
            </div>

            <div className="bg-gray-100 p-6 rounded-lg mt-8">
              <p className="text-sm text-gray-700 mb-4">
                <strong>Contact Information:</strong>
              </p>
              <p className="text-sm text-gray-700">
                <strong>Optio Academy</strong><br />
                Optio, LLC<br />
                1555 Freedom Blvd 200 W<br />
                Provo, UT 84604<br />
                <br />
                <strong>Email:</strong> support@optioeducation.com<br />
                <strong>Website:</strong> https://optioeducation.com
              </p>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200 flex justify-between items-center">
            <Link to="/register" className="text-primary hover:text-purple-600 font-medium">
              ← Back to Registration
            </Link>
            <Link
              to="/academy-agreement"
              className="text-primary hover:text-purple-600 font-medium"
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
