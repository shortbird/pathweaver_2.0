import api from './api'

// Public POE (Pipe Organ Encounter) pilot endpoints. No auth required.

// Active POE locations for the registration picker on /poe.
export const getPoeCohorts = async () => {
  const response = await api.get('/api/public/poe/cohorts')
  return response.data
}

// Create the participant account, record parental consent, set up the journal topic.
// body: { poe_cohort, student:{...}, parent?:{...}, consent?:{...}, school:{...} }
export const enrollInPoe = async (body) => {
  const response = await api.post('/api/public/poe/enroll', body)
  return response.data
}
