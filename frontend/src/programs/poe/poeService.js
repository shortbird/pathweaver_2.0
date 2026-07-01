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
