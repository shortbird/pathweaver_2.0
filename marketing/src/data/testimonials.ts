/**
 * Real voices, migrated verbatim from the existing site
 * (frontend/src/pages/marketing/AcademyPage.jsx, ClassesPage.jsx,
 * ForFamiliesPage.jsx). Do not edit quotes; do not invent new ones.
 */
export interface Testimonial {
  quote: string
  name: string
  context: string
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "High school just wasn't challenging enough. I had so many projects I wanted to work on, but I was stuck in a classroom filling out worksheets. Switching to Optio lets me take on real, challenging work I'm actually excited about, and earn my diploma at the same time.",
    name: 'Clare B.',
    context: 'Optio Student',
  },
  {
    quote:
      "We've always homeschooled our seven kids because we wanted them to get the best education possible, and Optio has been a perfect fit. Our kids get one-on-one mentorship from their Optio teacher, and the teacher helps them build their learning around the things they already love.",
    name: 'Paige H.',
    context: 'Optio Parent',
  },
  {
    quote:
      "I've loved helping my son recognize learning whenever it happens, like a spontaneous conversation about rhyme scheme at the dinner table, or when he won a rap battle playing games with friends and I told him to earn some XP for the grammar.",
    name: 'Andrea F.',
    context: 'Optio Parent',
  },
]

export const classTestimonial: Testimonial = {
  quote:
    "He LOVES the ability to work in any order, and he loves that it isn't graded. Some days he types his answers, and lots of days he takes a picture of his notes. I really hope this is how he wants to do his economics class next summer, because I'm having a great time, and I know he's learning a lot more than he would be just clicking through an online course.",
  name: 'Andrea F.',
  context: 'Optio Parent',
}
