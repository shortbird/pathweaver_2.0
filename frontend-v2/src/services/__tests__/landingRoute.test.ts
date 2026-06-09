import { describe, it, expect } from '@jest/globals';
import { isParentUser, landingRouteForUser } from '../landingRoute';

const base = { id: 'u1', email: 'a@b.com', org_role: null } as any;

describe('isParentUser', () => {
  it('is false for null and plain students', () => {
    expect(isParentUser(null)).toBe(false);
    expect(isParentUser({ ...base, role: 'student' })).toBe(false);
  });

  it('is true for platform parents', () => {
    expect(isParentUser({ ...base, role: 'parent' })).toBe(true);
  });

  it('is true for org-managed parents via org_role', () => {
    expect(isParentUser({ ...base, role: 'org_managed', org_role: 'parent' })).toBe(true);
  });

  it('is true for users with linked dependents/students', () => {
    expect(isParentUser({ ...base, role: 'student', has_dependents: true })).toBe(true);
    expect(isParentUser({ ...base, role: 'student', has_linked_students: true })).toBe(true);
  });
});

describe('landingRouteForUser', () => {
  it('sends parents to the family tab', () => {
    expect(landingRouteForUser({ ...base, role: 'parent' })).toBe('/(app)/(tabs)/family');
  });

  it('sends students and unknown users to the dashboard', () => {
    expect(landingRouteForUser({ ...base, role: 'student' })).toBe('/(app)/(tabs)/dashboard');
    expect(landingRouteForUser(null)).toBe('/(app)/(tabs)/dashboard');
  });

  it('sends superadmins to the dashboard even with dependents (default Student preview shell)', () => {
    expect(landingRouteForUser({ ...base, role: 'superadmin' })).toBe('/(app)/(tabs)/dashboard');
    expect(landingRouteForUser({ ...base, role: 'superadmin', has_dependents: true })).toBe('/(app)/(tabs)/dashboard');
  });
});
