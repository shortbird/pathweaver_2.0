/**
 * A slot's minutes-since-midnight as the compact 12-hour label the grids use.
 */
import { compact12h } from '../../utils/timeFormat'

const fmtHour = (min) => compact12h(`${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`)

export default fmtHour
