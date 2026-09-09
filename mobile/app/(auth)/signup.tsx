/**
 * /signup -> /register alias.
 *
 * Partner enrollment links (originally the OpenEd marketplace tile, PRD 4.1; the diploma program is now Hearthwood Academy's) use /signup?partner=opened-academy.
 * The real form lives at /register; this preserves any query params (the partner
 * key) through the redirect so OEA branding + tagging still fire.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function SignupAlias() {
  const params = useLocalSearchParams<{ partner?: string }>();
  return <Redirect href={{ pathname: '/(auth)/register', params }} />;
}
