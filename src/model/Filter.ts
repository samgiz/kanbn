import { Tag } from './Tag'
import * as utility from '../utility'
export interface Filter {
  id: string | string[] | null,
  name: string | string[] | null,
  description: string | string[] | null,
  created: Date | Date[] | null,
  updated: Date | Date[] | null,
  started: Date | Date[] | null,
  completed: Date | Date[] | null,
  due: Date | Date[] | null,
  column: string | string[] | null,
  tag: Tag | Tag[] | null,
  countTags: number | number[] | null,
  subTask: string | string[] | null,
  countSubTasks: number | number[] | null,
  workload: number | number[] | null,
  progress: number | number[] | null,
  assigned: string | string[] | null,
  relation: string | string[] | null,
  countRelations: number | number[] | null,
  comment: string | string[] | null,
  countComments: number | number[] | null,
  customFields: Record<string, any>,
}

export const EMPTY_FILTER: Filter = {
  id: null,
  name: null,
  description: null,
  created: null,
  updated: null,
  started: null,
  completed: null,
  due: null,
  column: null,
  tag: null,
  countTags: null,
  subTask: null,
  countSubTasks: null,
  workload: null,
  progress: null,
  assigned: null,
  relation: null,
  countRelations: null,
  comment: null,
  countComments: null,
  customFields: {}
}


/**
 * Check if the input string matches the filter regex
 * @param {string|string[]} filter A regular expression or array of regular expressions
 * @param {string} input The string to match against
 * @return {boolean} True if the input matches the string filter
 */
export function stringFilter (filter: string|string[], input: string) {
  if (Array.isArray(filter)) {
    filter = filter.join('|')
  }
  return new RegExp(filter, 'i').test(input)
}

/**
 * Check if the input date matches a date (ignore time part), or if multiple dates are passed in, check if the
 * input date is between the earliest and latest dates
 * @param {Date|Date[]} dates A date or list of dates to check against
 * @param {Date} input The input date to match against
 * @return {boolean} True if the input matches the date filter
 */
export function dateFilter (dates: Date|Date[], input: Date) {
  const dateArray: Date[] = utility.arrayArg(dates)
  if (dateArray.length === 1) {
    return utility.compareDates(input, dateArray[0])
  }
  const earliest = new Date(Math.min(...dateArray.map((date) => date.valueOf())))
  const latest = new Date(Math.max(...dateArray.map((date) => date.valueOf())))
  return input >= earliest && input <= latest
}

/**
 * Check if the input matches a number, or if multiple numbers are passed in, check if the input is between the
 * minimum and maximum numbers
 * @param {number|number[]} filter A filter number or array of filter numbers
 * @param {number} input The number to match against
 * @return {boolean} True if the input matches the number filter
 */
export function numberFilter (filter: number | number[], input: number) {
  const filterArray: number[] = utility.arrayArg(filter)
  return input >= Math.min(...filterArray) && input <= Math.max(...filterArray)
}
