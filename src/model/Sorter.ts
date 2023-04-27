import { Task } from './Task'
import * as utility from '../utility'

export interface Sorter {
  field: "id"
  filter: string | null
  order: "ascending" | "descending"
}

/**
 * Sort a list of tasks
 * @param {object[]} tasks
 * @param {object[]} sorters
 * @return {object[]} The sorted tasks
 */
export function sortTasks (tasks: Task[], sorters: Sorter[]) {
  tasks.sort((a, b) => {
    let compareA, compareB
    for (const sorter of sorters) {
      compareA = a[sorter.field]
      compareB = b[sorter.field]
      if (sorter.filter) {
        compareA = sortFilter(compareA, sorter.filter)
        compareB = sortFilter(compareB, sorter.filter)
      }
      if (compareA === compareB) {
        continue
      }
      return sorter.order === 'descending' ? compareValues(compareB, compareA) : compareValues(compareA, compareB)
    }
    return 0
  })
  return tasks
}

/**
 * Transform a value using a sort filter regular expression
 * @param {string} value
 * @param {string} filter
 * @return {string} The transformed value
 */
function sortFilter (value: string, filter: string) {
  // Filter regex is global and case-insensitive
  const matches = [...value.matchAll(new RegExp(filter, 'gi'))]
  const result = matches.map((match) => {
    // If the matched string has named capturing groups, concatenate their contents
    if (match.groups) {
      return Object.values(match.groups).join('')
    }

    // If the matched string has non-named capturing groups, use the contents of the first group
    if (match[1]) {
      return match[1]
    }

    // Otherwise use the matched string
    return match[0]
  })
  return result.join('')
}

/**
 * Compare two values (supports string, date and number values)
 * @param {any} a
 * @param {any} b
 * @return {number} A positive value if a > b, negative if a < b, otherwise 0
 */
function compareValues (a: any, b: any) {
  if (a === undefined && b === undefined) {
    return 0
  }
  a = utility.coerceUndefined(a, typeof b)
  b = utility.coerceUndefined(b, typeof a)
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, undefined, { sensitivity: 'accent' })
  }
  return a - b
}
