/* eslint-disable no-useless-escape */

type Tag1 = 'b' | 'd'
type Tag2 = 'bold' | 'dim'
const tags: Record<Tag1, Tag2> = {
  b: 'bold',
  d: 'dim'
}

/**
 * Show an error message in the console
 * @param {Error|string} error
 * @param {boolean} dontExit
 */
export const error = (error: Error|string, dontExit: boolean = false) => {
  const message = error instanceof Error
    ? (process.env.DEBUG === 'true' ? error : replaceTags(error.message))
    : replaceTags(error)
  console.error(message)
  !dontExit && process.env.KANBN_ENV !== 'test' && process.exit(1)
}

/**
 * Convert a string to simplified paramcase, e.g:
 *  PascalCase -> pascalcase
 *  Test Word -> test-word
 * @param {string} s The string to convert
 * @return {string} The converted string
 */
const paramCase = (s: string) => {
  return s
    .replace(
      /([A-Z]+(.))/g,
      (_, separator, letter, offset) => (offset ? '-' + separator : separator).toLowerCase()
    )
    .split(/[\s!?.,@:;|\\/"'`£$%\^&*{}[\]()<>~#+\-=_¬]+/g)
    .join('-')
    .replace(/(^-|-$)/g, '')
}

/**
 * Get a task id from the task name
 * @param {string} name The task name
 * @return {string} The task id
 */
export const getTaskId = (name: string) => {
  return paramCase(name)
}

/**
 * Convert an argument into a string. If the argument is an array of strings, concatenate them or use the
 * last element
 * @param {string|string[]} arg An argument that might be a string or an array of strings
 * @return {string} The argument value as a string
 */
export const strArg = (arg: string | string[], all = false): string => {
  if (Array.isArray(arg)) {
    return all ? arg.join(',') : arg.pop() ?? ''
  }
  return arg
}

/**
 * Convert an argument into an array. If the argument is a string, return it as a single-element array
 * @param {string|string[]} arg An argument that might be a string or an array of strings
 * @return {string[]} The argument value as an array
 */
export const arrayArg = <ArrayType>(arg: ArrayType | ArrayType[]): ArrayType[] => {
  if (Array.isArray(arg)) {
    return arg
  }
  return [arg]
}

/**
 * Remove escape characters ('/' and '\') from the beginning of a string
 * @param {string} s The string to trim
 */
export const trimLeftEscapeCharacters = (s: string) => {
  return s.replace(/^[\\\/]+/, '')
}

/**
 * Compare two dates using only the date part and ignoring time
 * @param {Date} a
 * @param {Date} b
 * @return {boolean} True if the dates are the same
 */
export const compareDates = (a: Date, b: Date) => {
  const aDate = new Date(a); const bDate = new Date(b)
  aDate.setHours(0, 0, 0, 0)
  bDate.setHours(0, 0, 0, 0)
  return aDate.getTime() === bDate.getTime()
}

/**
 * If a is undefined, convert it to a number or string depending on the specified type
 * @param {*} a
 * @param {string} type
 * @return {string|number}
 */
export const coerceUndefined = (a: any, type: any) => {
  if (a === undefined) {
    switch (type) {
      case 'string':
        return ''
      default:
        return 0
    }
  }
  return a
}

/**
 * Make a string bold
 * @param {string} s The string to wrap
 * @return {string} The updated string
 */
const bold = (s: string) => {
  return `\x1b[1m${s}\x1b[0m`
}

/**
 * Make a string dim
 * @param {string} s The string to wrap
 * @return {string} The updated string
 */
const dim = (s: string) => {
  return `\x1b[2m${s}\x1b[0m`
}

/**
 * Replace tags like {x}...{x} in a string
 * @param {string} s The string in which to replace tags
 * @return {string} The updated string
 */
export const replaceTags = (s: string) => {
  const getTagReplacement = (tag: string) => {
    switch (tag) {
      case 'bold':
        return bold
      case 'dim':
        return dim
      default:
        throw new Error(`Unknown tag: ${tag}`)

    }
  }

  for (const [tag1, tag2] of Object.entries(tags)) {
    const r = new RegExp(`\{${tag1}\}([^{]+)\{${tag1}\}`, 'g')
    s = s.replace(r, (m, s) => getTagReplacement(tag2)(s))
  }
  return s
}

/**
 * Zip 2 arrays together, i.e. ([1, 2, 3], [a, b, c]) => [[1, a], [2, b], [3, c]]
 * @param {any[]} a
 * @param {any[]} b
 * @return {any[]}
 */
export const zip = <T1,T2>(a: T1[], b: T2[]): [T1,T2][] => a.map((k, i) => [k, b[i]])

