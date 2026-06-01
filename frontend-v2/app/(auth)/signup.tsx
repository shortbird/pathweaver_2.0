/**
 * /signup -> /register alias.
 *
 * The OpenEd marketplace tile links to /signup?partner=opened-academy (PRD 4.1).
 * The real form lives at /register; this preserves any query params (the partner
 * key) through the redirect so OEA branding + tagging still fire.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function SignupAlias() {
  const params = useLocalSearchParams<{ partner?: string }>();
  return <Redirect href={{ pathname: '/(auth)/register', params }} />;
}
