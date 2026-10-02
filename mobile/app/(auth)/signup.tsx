/**
 * /signup -> /register alias.
 *
 * Old links point at /signup (the Hearthwood partner link,
 * /signup?partner=opened-academy, was one until that program was retired on
 * 2026-10-02). The real form lives at /register; this keeps any query params
 * through the redirect. The register form no longer reads `partner`.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function SignupAlias() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/(auth)/register', params }} />;
}
