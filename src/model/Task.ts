import { CustomField } from "./CustomField"
import { Tag } from "./Tag"
import { Subtask } from "./Subtask"
import { DueData } from "./DueData"
import { Relation } from "./Relation"

import * as path from 'path'
import { Comment } from './Comment';

export type TaskId = string

export interface TaskMetadata {
  tags: Tag[]
  column: string | null
  columns: string[]
  updated: Date | null
  created: Date | null
  started: Date | null
  completed: Date | null
  archived: string
  due: Date | null
  position: number
  workload: number
  progress: number
  assigned: string
  customFields: Record<string, CustomField>
}

export type MetadataProperty = keyof TaskMetadata


export interface Task {
  id: TaskId
  metadata: TaskMetadata
  subTasks: Subtask[]
  relations: Relation[]
  comments: Comment[]
  created: Date
  updated: Date
  name: string
  description: string
  workload: number
  started: Date
  completed: Date
  archived: string
  due: Date
  column: string | null
  position: number
  tags: Tag[]
  progress: number
  remainingWorkload: number
  dueData: DueData
}

export interface TaskData {
  name: string
  metadata: TaskMetadata
}

/**
 * Calculate task workload statistics between a start and end date
 * @param {object[]} tasks
 * @param {string} metadataProperty
 * @param {Date} start
 * @param {Date} end
 * @return {object} A statistics object
 */
export function taskWorkloadInPeriod (tasks: Task[], metadataProperty: MetadataProperty, start: Date, end: Date) {
  const filteredTasks = tasks.filter(
    (task) =>
      (task.metadata[metadataProperty] ?? new Date()) >= start &&
      (task.metadata[metadataProperty] ?? new Date()) <= end
  )
  return {
    tasks: filteredTasks.map((task) => ({
      id: task.id,
      column: task.column,
      workload: task.workload
    })),
    workload: filteredTasks.reduce((a, task) => a + task.workload, 0)
  }
}

export function taskWorkloadInCustomPeriod (tasks: Task[], customField: string, start: Date, end: Date) {
  const filteredTasks = tasks.filter(
    (task) => {
      return customField in task.metadata.customFields && 
        task.metadata.customFields[customField].value >= start &&
        task.metadata.customFields[customField].value <= end
    }
  )
  return {
    tasks: filteredTasks.map((task) => ({
      id: task.id,
      column: task.column,
      workload: task.workload
    })),
    workload: filteredTasks.reduce((a, task) => a + task.workload, 0)
  }
}

/**
   * Get a task path from the id
   * @param {string} tasksPath The path to the tasks folder
   * @param {string} taskId The task id
   * @return {string} The task path
   */
export function getTaskPath (tasksPath: string, taskId: string): string {
  return path.join(tasksPath, addFileExtension(taskId))
}

/**
 * Add the file extension to an id if it doesn't already have one
 * @param {string} taskId The task id
 * @return {string} The task id with .md extension
 */
export function addFileExtension (taskId: string) {
  if (!/\.md$/.test(taskId)) {
    return `${taskId}.md`
  }
  return taskId
}

/**
* Remove the file extension from an id if it has one
* @param {string} taskId The task id
* @return {string} The task id without .md extension
*/
export function removeFileExtension (taskId: TaskId): string {
 if (/\.md$/.test(taskId)) {
   return taskId.slice(0, taskId.length - '.md'.length)
 }
 return taskId
}
