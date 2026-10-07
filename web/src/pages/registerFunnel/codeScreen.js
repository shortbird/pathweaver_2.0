import { toast } from 'react-hot-toast'

/**
 * Show the "enter the code we emailed you" screen.
 *
 * Two doors land here: "Create account" (/start), and "Sign in" (/login) for a
 * parent whose registration still waits on the code. Supabase refuses to sign
 * in an unconfirmed email, so for that parent the server sends a fresh code
 * instead of checking the password (2026-10-07).
 */
export function openCodeScreen(data, setPendingVerify) {
  setPendingVerify({ registration_id: data.registration_id, email: data.email })
  if (data.otp_sent === false) {
    toast.error('We could not send the confirmation email — click "Resend code" in a moment.')
  } else if (data.message) {
    toast.success(data.message)
  }
}
