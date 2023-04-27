import {Task, TaskId, TaskData} from './Task'
import {CustomField} from './CustomField'
import {Sorter, sortTasks} from './Sorter'
import { Filter, dateFilter, stringFilter, numberFilter } from './Filter'


import * as fs from 'fs'
import * as parseIndex from '../parse-index'
import * as utility from '../utility'
import { Sprint } from './Sprint';

export interface InitialIndexOptions {
  name: string
  description: string
  options: IndexOptions
  columns: string[]
}

export interface IndexOptions {
  startedColumns: string[],
  completedColumns: string[],
  customFields: CustomField[],
  columnSorting: Record<string, Sorter[]>,
  sprints: Sprint[],
  defaultTaskWorkload: number,
  taskWorkloadTags: Record<string, number>,
}

export class Index {
  public name: string
  public description: string
  public columns: Record<string, TaskId[]>
  public options: IndexOptions
  public constructor(name: string, description: string, options: IndexOptions, columns: Record<string, TaskId[]>) {
    this.name = name
    this.description = description
    this.options = options
    this.columns = columns
  }
  /**
 * Check if a task is completed
 * @param {object} index
 * @param {object} task
 * @return {boolean} True if the task is in a completed column or has a completed date
 */
  public taskCompleted (task: Task) {
    return (
      'completed' in task.metadata ||
      ('completedColumns' in this.options &&
        this.options.completedColumns.indexOf(this.findTaskColumn(task.id) ?? '') !== -1)
    )
  }

  /**
 * Find a task in the index and returns the column that it's in
 * @param {object} index The index data
 * @param {string} taskId The task id to search for
 * @return {?string} The column name for the specified task, or null if it wasn't found
 */
  public findTaskColumn (taskId: string): string | null {
    for (const columnName in this.columns) {
      if (this.columns[columnName].indexOf(taskId) !== -1) {
        return columnName
      }
    }
    return null
  }
  /**
 * Add a task id to the specified column in the index
 * @param {object} index The index object
 * @param {string} taskId The task id to add
 * @param {string} columnName The column to add the task to
 * @param {?number} [position=null] The position in the column to move the task to, or last position if null
 * @return {object} The modified index object
 */
  public addTask (taskId: string, columnName: string, position: number | null = null) {
    if (position === null) {
      this.columns[columnName].push(taskId)
    } else {
      this.columns[columnName].splice(position, 0, taskId)
    }
    return this
  }

  /**
   * Remove all instances of a task id from the index
   * @param {string} taskId The task id to remove
   * @return {object} The modified index object
   */
  public removeTask (taskId: string) {
    for (const columnName in this.columns) {
      this.columns[columnName] = this.columns[columnName].filter((t: string) => t !== taskId)
    }
    return this
  }
  /**
   * Rename all instances of a task id in the index
   * @param {object} index The index object
   * @param {string} taskId The task id to rename
   * @param {string} newTaskId The new task id
   * @return {object} The modified index object
   */
  public renameTask (taskId: string, newTaskId: string) {
    for (const columnName in this.columns) {
      this.columns[columnName] = this.columns[columnName].map((t: string) => (t === taskId ? newTaskId : t))
    }
    return this
  }

  /**
   * Sort a column in the index
   * @param {object[]} tasks The tasks in the index
   * @param {string} columnName The column to sort
   * @param {object[]} sorters A list of sorter objects
   * @return {object} The modified index object
   */
  public sortColumn (tasks: Task[], columnName: string, sorters: Sorter[]) {
    // Get a list of tasks in the target column and add computed fields
    let sortableTasks: any = tasks.map((task) => ({
      ...task,
      ...task.metadata,
      created: 'created' in task.metadata ? task.metadata.created : '',
      updated: 'updated' in task.metadata ? task.metadata.updated : '',
      started: 'started' in task.metadata ? task.metadata.started : '',
      completed: 'completed' in task.metadata ? task.metadata.completed : '',
      due: 'due' in task.metadata ? task.metadata.due : '',
      assigned: 'assigned' in task.metadata ? task.metadata.assigned : '',
      countSubTasks: task.subTasks.length,
      subTasks: task.subTasks.map((subTask) => `[${subTask.completed ? 'x' : ''}] ${subTask.text}`).join('\n'),
      countTags: 'tags' in task.metadata ? task.metadata.tags.length : 0,
      tags: 'tags' in task.metadata ? task.metadata.tags.join('\n') : '',
      countRelations: task.relations.length,
      relations: task.relations.map((relation) => `${relation.type} ${relation.task}`).join('\n'),
      countComments: task.comments.length,
      comments: task.comments.map((comment) => `${comment.author} ${comment.text}`).join('\n'),
      workload: this.taskWorkload(task),
      progress: this.taskProgress(task)
    }))

    // Sort the list of tasks
    sortableTasks = sortTasks(sortableTasks, sorters)

    // Save the list of tasks back to the index
    this.columns[columnName] = sortableTasks.map((task: any) => task.id)
    return this
  }

  // TODO: I question whether this belongs in Index
  // Should most likely belong in task, passing it 2 first variables
  /**
   * Calculate task workload
   * @param {object} index The index object
   * @param {object} task The task object
   * @return {number} The task workload
   */
  public taskWorkload (task: Task) {
    const defaultTaskWorkload = this.options.defaultTaskWorkload
    const taskWorkloadTags = this.options.taskWorkloadTags
    let workload = 0
    let hasWorkloadTags = false
    if ('tags' in task.metadata) {
      for (const workloadTag of Object.keys(taskWorkloadTags)) {
        if (task.metadata.tags.indexOf(workloadTag) !== -1) {
          workload += taskWorkloadTags[workloadTag]
          hasWorkloadTags = true
        }
      }
    }
    if (!hasWorkloadTags) {
      workload = defaultTaskWorkload
    }
    return workload
  }

  /**
   * Get task progress amount
   * @param {object} index
   * @param {object} task
   * @return {number} Task progress
   */
  public taskProgress (task: Task) {
    if (this.taskCompleted(task)) {
      return 1
    }
    return task.metadata.progress
  }

  /**
   * If index options contains a list of columns linked to a custom field name and a task's column matches one
   * of the columns in this list, set the task's custom field value to the current date depending on criteria:
   * - if 'once', update the value only if it's not currently set
   * - if 'always', update the value regardless
   * - otherwise, don't update the value
   * @param {object} index
   * @param {object} taskData
   * @param {string} columnName
   * @param {string} fieldName
   * @param {string} [updateCriteria='none']
   */
  public updateColumnLinkedCustomField (taskData: Task, columnName: string, fieldName: any, updateCriteria: string = 'none') {
    const columnList: string = `${fieldName}Columns`
    const columnListIndex = this.options.customFields.findIndex((customField) => customField.name === columnList)
    if (columnListIndex != -1 && this.options.customFields[columnListIndex].value.indexOf(columnName) !== -1) {
      switch (updateCriteria) {
        case 'always': {
          // const index = taskData.metadata.customFields.findIndex((customField) => customField.name === fieldName)
          const newValue = {
            name: fieldName,
            value: new Date(),
            type: 'date',
            updateDate: null
          }
          taskData.metadata.customFields[fieldName] = newValue
          break
        }
        case 'once': {
          if (!(fieldName in taskData.metadata.customFields)) {
            const newValue = {
              name: fieldName,
              value: new Date(),
              type: 'date',
              updateDate: null
            }
            taskData.metadata.customFields[fieldName] = newValue
          }
          break
        }
          
        default:
          break
      }
    }
    return taskData
  }

  /**
   * Return a filtered and sorted list of tasks
   * @param {index} index The index object
   * @param {task[]} tasks A list of task objects
   * @param {object} filters A list of task filters
   * @param {object[]} sorters A list of task sorters
   * @return {object[]} A filtered and sorted list of tasks
   */
  filterAndSortTasks (tasks: Task[], filters: Filter, sorters: Sorter[]) {
    return sortTasks(this.filterTasks(tasks, filters), sorters)
  }

  /**
   * Filter a list of tasks using a filters object containing field names and filter values
   * @param {object[]}} tasks
   * @param {object} filters
   */
  public filterTasks (tasks: Task[], filters: Filter) {
    return tasks.filter((task) => {
      // Get task id and column
      const taskId = utility.getTaskId(task.name)
      const column = this.findTaskColumn(taskId)

      // If no filters are defined, return all tasks
      if (Object.keys(filters).length === 0) {
        return true
      }

      // Apply filters
      let result = true

      // Id
      if (filters.id && !stringFilter(filters.id, task.id)) {
        result = false
      }

      // Name
      if (filters.name && !stringFilter(filters.name, task.name)) {
        result = false
      }

      // Description
      if (filters.description && !stringFilter(filters.description, task.description)) {
        result = false
      }

      // Column
      if (filters.column && !stringFilter(filters.column, column ?? '')) {
        result = false
      }

      // Created date
      if (
        filters.created &&
        (task.metadata.created === null || !dateFilter(filters.created, task.metadata.created))
      ) {
        result = false
      }

      // Updated date
      if (
        filters.updated &&
        (!task.metadata.updated || !dateFilter(filters.updated, task.metadata.updated))
      ) {
        result = false
      }

      // Started date
      if (
        filters.started &&
        (!task.metadata.started || !dateFilter(filters.started, task.metadata.started))
      ) {
        result = false
      }

      // Completed date
      if (
        filters.completed &&
        (!task.metadata.completed || !dateFilter(filters.completed, task.metadata.completed))
      ) {
        result = false
      }

      // Due
      if (filters.due && (!task.metadata.due || !dateFilter(filters.due, task.metadata.due))) {
        result = false
      }

      // Workload
      if (filters.workload && !numberFilter(filters.workload, this.taskWorkload(task))) {
        result = false
      }

      // Progress
      if (filters.progress && !numberFilter(filters.progress, this.taskProgress(task))) {
        result = false
      }

      // Assigned
      if (
        filters.assigned &&
        !stringFilter(filters.assigned, task.metadata.assigned ? task.metadata.assigned : '')
      ) {
        result = false
      }

      // Sub-tasks
      if (
        filters.subTask &&
        !stringFilter(
          filters.subTask,
          task.subTasks.map((subTask) => `[${subTask.completed ? 'x' : ' '}] ${subTask.text}`).join('\n')
        )
      ) {
        result = false
      }

      // Count sub-tasks
      if (filters.countSubTasks && !numberFilter(filters.countSubTasks, task.subTasks.length)) {
        result = false
      }

      // Tag
      if (filters.tag && !stringFilter(filters.tag, task.metadata.tags.join('\n'))) {
        result = false
      }

      // Count tags
      if (filters.countTags && !numberFilter(filters.countTags, task.tags.length)) {
        result = false
      }

      // Relation
      if (
        filters.relation &&
        !stringFilter(
          filters.relation,
          task.relations.map((relation) => `${relation.type} ${relation.task}`).join('\n')
        )
      ) {
        result = false
      }

      // Count relations
      if (filters.countRelations && !numberFilter(filters.countRelations, task.relations.length)) {
        result = false
      }

      // Comments
      if (
        filters.comment &&
        !stringFilter(filters.comment, task.comments.map((comment) => `${comment.author} ${comment.text}`).join('\n'))
      ) {
        result = false
      }

      // Count comments
      if (filters.countComments && !numberFilter(filters.countComments, task.comments.length)) {
        result = false
      }

      // Custom metadata properties
      // if ('customFields' in index.options.customFields) {
        for (const customField of this.options.customFields) {
          if (customField.name in filters) {
            if (!(customField.name in task.metadata.customFields)) {
              result = false
            } else {
              switch (customField.type) {
                case 'boolean':
                  if (task.metadata.customFields[customField.name].value !== filters.customFields[customField.name]) {
                    result = false
                  }
                  break
                case 'number':
                  if (!numberFilter(filters.customFields[customField.name], task.metadata.customFields[customField.name].value)) {
                    result = false
                  }
                  break
                case 'string':
                  if (!stringFilter(filters.customFields[customField.name], task.metadata.customFields[customField.name].value)) {
                    result = false
                  }
                  break
                case 'date':
                  if (!dateFilter(filters.customFields[customField.name], task.metadata.customFields[customField.name].value)) {
                    result = false
                  }
                  break
                default:
                  break
              }
            }
          }
        }
      // }
      return result
    })
  }

  /**
   * Get a list of all tracked task ids
   * @param {object} index The index object
   * @param {?string} [columnName=null] The optional column name to filter tasks by
   * @return {Set} A set of task ids appearing in the index
   */
  public getTrackedTaskIds (columnName: string | null = null) {
    return new Set(
      columnName
        ? this.columns[columnName]
        : Object.keys(this.columns)
          .map((columnName) => this.columns[columnName])
          .flat()
    )
  }

  /**
   * Check if a task exists in the index
   * @param {object} index The index object
   * @param {string} taskId The task id to search for
   * @return {boolean} True if the task exists in the index
   */
  public contains (taskId: string) {
    for (const columnName in this.columns) {
      if (this.columns[columnName].indexOf(taskId) !== -1) {
        return true
      }
    }
    return false
  }

  /**
   * If a task's column is linked in the index to a custom field with type date, update the custom field's value
   * in the task data with the current date
   * @param {object} index
   * @param {object} taskData
   * @param {string} columnName
   * @return {object} The updated task data
   */
  public updateColumnLinkedCustomFields (taskData: Task, columnName: string) {
    // Update built-in column-linked metadata properties first (started and completed dates)
    taskData = this.updateColumnLinkedCustomField(taskData, columnName, 'completed', 'once')
    taskData = this.updateColumnLinkedCustomField(taskData, columnName, 'started', 'once')

    // Update column-linked custom fields
    // if ('customFields' in index.options) {
      for (const customField of this.options.customFields) {
        if (customField.type === 'date') {
          taskData = this.updateColumnLinkedCustomField(
            taskData,
            columnName,
            customField.name,
            customField.updateDate || 'none'
          )
        }
      }
    // }
    return taskData
  }
}
