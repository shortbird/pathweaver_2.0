import { createContext, useContext } from 'react'

/**
 * The context behind useRecordDoors, in a module of its own so the two
 * record modals can import the hook without importing the provider that
 * mounts them (RecordDoors.jsx imports the modals; a modal importing
 * RecordDoors.jsx back would be a cycle). Pages import from RecordDoors.jsx.
 */
export const RecordDoorsContext = createContext(null)

// Outside the provider (tests render pages bare) the doors are closed.
export const CLOSED_DOORS = {
  openStudent: () => {}, closeStudent: () => {},
  openFamily: () => {}, closeFamily: () => {},
  openStaff: () => {}, closeStaff: () => {},
}

export const useRecordDoors = () => useContext(RecordDoorsContext) || CLOSED_DOORS
