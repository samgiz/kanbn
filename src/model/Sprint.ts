import { Task } from "./Task"

export interface Sprint {
  name: string,
  description: string,
  start: Date,
  number: number
}

/**
 * Calculate the total workload at a specific date
 * @param {object[]} tasks
 * @param {Date} date
 * @return {number} The total workload at the specified date
 */
export function getWorkloadAtDate (tasks: Task[], date: Date) {
  return getActiveTasksAtDate(tasks, date).reduce((a, task) => (a += task.workload), 0)
}

/**
 * Get the number of tasks that were active at a specific date
 * @param {object[]} tasks
 * @param {Date} date
 * @return {number} The total number of active tasks at the specified date
 */
export function countActiveTasksAtDate (tasks: Task[], date: Date) {
  return getActiveTasksAtDate(tasks, date).length
}

/**
 * Get a list of tasks that were started or completed on a specific date
 * @param {object[]} tasks
 * @param {Date} date
 * @return {object[]} A list of event objects, with event type and task id
 */
export function getTaskEventsAtDate (tasks: Task[], date: Date) {
  return [
    ...tasks
      .filter((task) => (task.created ? task.created.getTime() : 0) === date.getTime())
      .map((task) => ({
        eventType: 'created',
        task
      })),
    ...tasks
      .filter((task) => (task.started ? task.started.getTime() : 0) === date.getTime())
      .map((task) => ({
        eventType: 'started',
        task
      })),
    ...tasks
      .filter((task) => (task.completed ? task.completed.getTime() : 0) === date.getTime())
      .map((task) => ({
        eventType: 'completed',
        task
      }))
  ]
}

/**
 * Quantize a burndown chart date to 1-hour resolution
 * @param {Date} date
 * @param {string} resolution One of 'days', 'hours', 'minutes', 'seconds'
 * @return {Date} The quantized dates
 */
export function normaliseDate (date: Date, resolution = 'minutes'): Date {
  const result = new Date(date.getTime())
  switch (resolution) {
    case 'days':
      result.setHours(0)
    // eslint-disable-next-line no-fallthrough
    case 'hours':
      result.setMinutes(0)
    // eslint-disable-next-line no-fallthrough
    case 'minutes':
      result.setSeconds(0)
    // eslint-disable-next-line no-fallthrough
    case 'seconds':
      result.setMilliseconds(0)
    // eslint-disable-next-line no-fallthrough
    default:
      break
  }
  return result
}

/**
 * Get a list of tasks that were started before and/or completed after a date
 * @param {object[]} tasks
 * @param {Date} date
 * @return {object[]} A filtered list of tasks
 */
export function getActiveTasksAtDate (tasks: Task[], date: Date) {
  return tasks.filter((task) => (
    (task.started !== null && task.started <= date) &&
    (task.completed === null || task.completed > date)
  ))
}
