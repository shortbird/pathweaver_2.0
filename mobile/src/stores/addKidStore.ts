/**
 * addKidStore - moved into familyStore on 2026-09-15, which also carries the
 * family scope (which child the parent is working for). This file keeps the
 * old import path working; new code should import from './familyStore'.
 */

export { useAddKidStore } from './familyStore';
