import api from '../../services/api'

// Public POE (Pipe Organ Encounter) pilot endpoints. No auth required.

// Active POE locations for the registration picker on /poe.
export const getPoeCohorts = async () => {
  const response = await api.get('/api/public/poe/cohorts')
  return response.data
}

// Add the participant to the POE credit-interest list and send a confirmation email.
// Does NOT create an account. body: { poe_cohort, student:{...}, parent?:{...}, school:{...} }
export const enrollInPoe = async (body) => {
  const response = await api.post('/api/public/poe/enroll', body)
  return response.data
}

// Every non-private piece of POE evidence, grouped camp -> camper -> day.
// Gated on an unguessable link key rather than a login: POE/AGO leadership have
// no Optio accounts. A wrong or missing key returns 404.
export const getPoeShowcase = async (key) => {
  const response = await api.get('/api/public/poe/showcase', { params: { key } })
  return response.data
}
