import * as path from 'path'
import * as fs from 'fs'
import * as humanizeDuration from 'humanize-duration'
import * as parseIndex from '../parse-index'
import * as parseTask from '../parse-task'
import * as utility from '../utility'
const rimraf = require('rimraf')
import {Config} from './Config'
import { TaskData, TaskId, addFileExtension, getTaskPath, removeFileExtension, taskWorkloadInCustomPeriod, taskWorkloadInPeriod } from './Task';
import { Index, IndexOptions, InitialIndexOptions } from './Index'
import { Task } from './Task'
const yaml = require('yamljs')
import { DueData } from './DueData'
import { Sorter } from './Sorter'
import { EMPTY_FILTER, Filter } from './Filter'
const glob = require('glob-promise')
import { StatusInfo } from './StatusInfo'
import { Sprint, normaliseDate, getWorkloadAtDate, countActiveTasksAtDate, getTaskEventsAtDate } from './Sprint';

export const DEFAULT_FOLDER_NAME = '.kanbn'
export const DEFAULT_INDEX_FILE_NAME = 'index.md'
export const DEFAULT_TASKS_FOLDER_NAME = 'tasks'
export const DEFAULT_ARCHIVE_FOLDER_NAME = 'archive'

// Date normalisation intervals measured in milliseconds
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Default fallback values for index options
const DEFAULT_TASK_WORKLOAD = 2
const DEFAULT_TASK_WORKLOAD_TAGS = {
  Nothing: 0,
  Tiny: 1,
  Small: 2,
  Medium: 3,
  Large: 5,
  Huge: 8
}
const DEFAULT_DATE_FORMAT = 'd mmm yy, H:MM'
// eslint-disable-next-line no-template-curly-in-string
const DEFAULT_TASK_TEMPLATE = "^+^_${overdue ? '^R' : ''}${name}^: ${created ? ('\\n^-^/' + created) : ''}"

/**
 * Default options for the initialise command
 */
const defaultInitialiseOptions: InitialIndexOptions = {
  name: 'Project Name',
  description: '',
  options: {
    startedColumns: ['In Progress'],
    completedColumns: ['Done'],
    customFields: [],
    columnSorting: {},
    sprints: [],
    defaultTaskWorkload: DEFAULT_TASK_WORKLOAD,
    taskWorkloadTags: DEFAULT_TASK_WORKLOAD_TAGS
  },
  columns: ['Backlog', 'Todo', 'In Progress', 'Done']
}

export class Kanbn {
  public index: Index | null = null
  ROOT = process.cwd()
  CONFIG_YAML = path.join(this.ROOT, 'kanbn.yml')
  CONFIG_JSON = path.join(this.ROOT, 'kanbn.json')

  // Memoize config
  configMemo: Config | null = null

  constructor (root = null) {
    if (root) {
      this.ROOT = root
      this.CONFIG_YAML = path.join(this.ROOT, 'kanbn.yml')
      this.CONFIG_JSON = path.join(this.ROOT, 'kanbn.json')
    }
  }

  /**
   * Check if a separate config file exists
   * @returns {Promise<boolean>} True if a config file exists
   */
  async configExists () {
    return await fs.existsSync(this.CONFIG_YAML) || await fs.existsSync(this.CONFIG_JSON)
  }

  /**
   * Save configuration data to a separate config file
   */
  async saveConfig (config: Config) {
    if (fs.existsSync(this.CONFIG_YAML)) {
      await fs.promises.writeFile(this.CONFIG_YAML, yaml.stringify(config, 4, 2))
    } else {
      await fs.promises.writeFile(this.CONFIG_JSON, JSON.stringify(config, null, 4))
    }
  }

  /**
   * Get configuration settings from the config file if it exists, otherwise return null
   * @return {Promise<Object|null>} Configuration settings or null if there is no separate config file
   */
  async getConfig (): Promise<Config|null> {
    if (this.configMemo === null) {
      let config = null
      if (fs.existsSync(this.CONFIG_YAML)) {
        try {
          config = yaml.load(this.CONFIG_YAML)
        } catch (error: any) {
          throw new Error(`Couldn't load config file: ${error.message}`)
        }
      } else if (await fs.existsSync(this.CONFIG_JSON)) {
        try {
          config = JSON.parse(await fs.promises.readFile(this.CONFIG_JSON, { encoding: 'utf-8' }))
        } catch (error: any) {
          throw new Error(`Couldn't load config file: ${error.message}`)
        }
      }
      this.configMemo = config
    }
    return this.configMemo
  }

  /**
   * Clear cached config
   */
  clearConfigCache () {
    this.configMemo = null
  }

  /**
   * Get the name of the folder where the index and tasks are stored
   * @return {Promise<string>} The kanbn folder name
   */
  async getFolderName () {
    const config = await this.getConfig()
    if (config !== null && 'mainFolder' in config) {
      return config.mainFolder
    }
    return DEFAULT_FOLDER_NAME
  }

  /**
   * Get the index filename
   * @return {Promise<string>} The index filename
   */
  async getIndexFileName () {
    const config = await this.getConfig()
    if (config !== null && 'indexFile' in config) {
      return config.indexFile
    }
    return DEFAULT_INDEX_FILE_NAME
  }

  /**
   * Get the name of the folder where tasks are stored
   * @return {Promise<string>} The task folder name
   */
  async getTaskFolderName () {
    const config = await this.getConfig()
    if (config !== null && 'taskFolder' in config) {
      return config.taskFolder
    }
    return DEFAULT_TASKS_FOLDER_NAME
  }

  /**
   * Get the name of the archive folder
   * @return {Promise<string>} The archive folder name
   */
  async getArchiveFolderName () {
    const config = await this.getConfig()
    if (config !== null && 'archiveFolder' in config) {
      return config.archiveFolder
    }
    return DEFAULT_ARCHIVE_FOLDER_NAME
  }

  /**
   * Get the kanbn folder location for the current working directory
   * @return {Promise<string>} The kanbn folder path
   */
  async getMainFolder () {
    return path.join(this.ROOT, await this.getFolderName())
  }

  /**
   * Get the index path
   * @return {Promise<string>} The kanbn index path
   */
  async getIndexPath () {
    return path.join(await this.getMainFolder(), await this.getIndexFileName())
  }

  /**
   * Get the task folder path
   * @return {Promise<string>} The kanbn task folder path
   */
  async getTaskFolderPath () {
    return path.join(await this.getMainFolder(), await this.getTaskFolderName())
  }

  /**
   * Get the archive folder path
   * @return {Promise<string>} The kanbn archive folder path
   */
  async getArchiveFolderPath () {
    return path.join(await this.getMainFolder(), await this.getArchiveFolderName())
  }
/**
 * Load the index file and parse it to an object
 * @return {Promise<object>} The index object
 */
async loadIndex (): Promise<Index> {
  let indexData = ''
  try {
    indexData = await fs.promises.readFile(await this.getIndexPath(), { encoding: 'utf-8' })
  } catch (error: any) {
    throw new Error(`Couldn't access index file: ${error.message}`)
  }
  const index: Index = parseIndex.md2json(indexData)

  // If configuration settings exist in a separate config file, merge them with index options
  const config = await this.getConfig()
  if (config !== null) {
    index.options = { ...index.options, ...config }
  }
  this.index = index
  return index
}
  /**
   * Get the index as an object
   * @return {Promise<index>} The index
   */
  async getIndex () {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    return this.loadIndex()
  }

  

  /**
   * Get a task as an object
   * @param {string} taskId The task id to get
   * @return {Promise<task>} The task
   */
  async getTask (taskId: TaskId) {
    this.taskExists(taskId)
    return this.loadTask(taskId)
  }

  /**
   * Add additional index-based information to a task
   * @param {index} index The index object
   * @param {task} task The task object
   * @return {task} The hydrated task
   */
  public hydrateTask (index: Index, task: Task) {
    const completed = index.taskCompleted(task)
    task.column = index.findTaskColumn(task.id)
    task.workload = index.taskWorkload(task)

    // Add progress information
    task.progress = index.taskProgress(task)
    task.remainingWorkload = Math.ceil(task.workload * (1 - task.progress))

    // Add due information
    if ('due' in task.metadata) {

      // A task is overdue if it's due date is in the past and the task is not in a completed column
      // or doesn't have a completed dates
      const completedDate = task.metadata.completed
      
      const delta: number = completedDate !== null ? completedDate.valueOf() - (task.metadata.due ?? new Date()).valueOf() : (new Date()).valueOf() - (task.metadata.due ?? new Date()).valueOf()
      const dueData: DueData = {
        dueDelta: delta,
        completed,
        completedDate,
        dueDate: task.metadata.due ?? new Date(),
        overdue: !completed && delta > 0,
        dueMessage: ''
      }

      // Get task due delta - this is the difference between now and the due date, or if the task is completed
      // this is the difference between the completed and due dates
      // let delta
      // if (completedDate !== null) {
      //   delta = completedDate - task.metadata.due
      // } else {
      //   delta = new Date() - task.metadata.due
      // }

      // Populate due information
      // dueData.completed = completed
      // dueData.completedDate = completedDate
      // dueData.dueDate = task.metadata.due
      // dueData.overdue = !completed && delta > 0
      // dueData.dueDelta = delta

      // Prepare a due message for the task
      let dueMessage = ''
      if (completed) {
        dueMessage += 'Completed '
      }
      dueMessage += `${humanizeDuration(delta, {
        largest: 3,
        round: true
      })} ${delta > 0 ? 'overdue' : 'remaining'}`
      dueData.dueMessage = dueMessage
      task.dueData = dueData
    }
    return task
  }

  /**
   * Overwrite a task file with the specified data
   * @param {string} path The task path
   * @param {object} taskData The task data
   */
  async saveTask (path: string, taskData: TaskData) {
    await fs.promises.writeFile(path, parseTask.json2md(taskData))
  }

  /**
   * Load a task file and parse it to an object
   * @param {string} taskId The task id
   * @return {Promise<object>} The task object
   */
  async loadTask (taskId: TaskId): Promise<Task> {
    const taskPath = path.join(await this.getTaskFolderPath(), addFileExtension(taskId))
    let taskData = ''
    try {
      taskData = await fs.promises.readFile(taskPath, { encoding: 'utf-8' })
    } catch (error: any) {
      throw new Error(`Couldn't access task file: ${error.message}`)
    }
    return parseTask.md2json(taskData) as Task
  }

  /**
   * Load all tracked tasks and return an array of task objects
   * @param {object} index The index object
   * @param {?string} [columnName=null] The optional column name to filter tasks by
   * @return {Promise<object[]>} All tracked tasks
   */
  async loadAllTrackedTasks (index: Index, columnName: null | string = null): Promise<Task[]> {
    const result: Task[] = []
    const trackedTasks = index.getTrackedTaskIds(columnName)
    for (const taskId of trackedTasks) {
      result.push(await this.loadTask(taskId))
    }
    return result
  }

  /**
   * Load a task file from the archive and parse it to an object
   * @param {string} taskId The task id
   * @return {Promise<object>} The task object
   */
  async loadArchivedTask (taskId: TaskId) {
    const taskPath = path.join(await this.getArchiveFolderPath(), addFileExtension(taskId))
    let taskData = ''
    try {
      taskData = await fs.promises.readFile(taskPath, { encoding: 'utf-8' })
    } catch (error: any) {
      throw new Error(`Couldn't access archived task file: ${error.message}`)
    }
    return parseTask.md2json(taskData)
  }

  /**
   * Get the date format defined in the index, or the default date format
   * @param {object} index The index object
   * @return {string} The date format
   */
  getDateFormat (index: Index) {
    return 'dateFormat' in index.options ? index.options.dateFormat : DEFAULT_DATE_FORMAT
  }

  /**
   * Get the task template for displaying tasks on the kanbn board from the index, or the default task template
   * @param {object} index The index object
   * @return {string} The task template
   */
  getTaskTemplate (index: Index) {
    return 'taskTemplate' in index.options ? index.options.taskTemplate : DEFAULT_TASK_TEMPLATE
  }

  /**
   * Check if the current working directory has been initialised
   * @return {Promise<boolean>} True if the current working directory has been initialised, otherwise false
   */
  async initialised () {
    return fs.existsSync(await this.getIndexPath())
  }

  /**
   * Initialise a kanbn board in the current working directory
   * @param {object} [options={}] Initial columns and other config options
   */
  async initialise (options: InitialIndexOptions = defaultInitialiseOptions) {
    // Check if a main folder is defined in an existing config file
    const mainFolder = await this.getMainFolder()

    // Create main folder if it doesn't already exist
    if (!fs.existsSync(mainFolder)) {
      await fs.promises.mkdir(mainFolder, { recursive: true })
    }

    // Create tasks folder if it doesn't already exist
    const taskFolder = await this.getTaskFolderPath()
    if (fs.existsSync(taskFolder)) {
      await fs.promises.mkdir(taskFolder, { recursive: true })
    }

    // Create index if one doesn't already exist
    let index: Index
    if (fs.existsSync(await this.getIndexPath())) {
      // If config already exists in a separate file, merge it into the options
      const config = await this.getConfig()

      // Create initial options
      const opts: any = Object.assign({}, defaultInitialiseOptions, options)
      index = new Index(opts.name, opts.descripton, Object.assign({}, opts.options, config || {}), Object.fromEntries(opts.columns.map((columnName: string) => [columnName, []])))
      // {
      //   name: opts.name,
      //   description: opts.description,
      //   options: Object.assign({}, opts.options, config || {}),
      //   columns: Object.fromEntries(opts.columns.map((columnName) => [columnName, []]))
      // }

      // Otherwise, if index already exists and we have specified new settings, re-write the index file
    } else {
      index = await this.loadIndex()
      index.name = options.name
      index.description = options.description
      index.options = Object.assign(index.options, options.options)
      index.columns = Object.assign(
        index.columns,
        Object.fromEntries(
          options.columns.map((columnName: string) => [
            columnName,
            columnName in index.columns ? index.columns[columnName] : []
          ])
        )
      )
    }
    await this.saveIndex(index)
  }

  /**
   * Overwrite the index file with the specified data
   * @param {object} indexData Index data to save
   */
  async saveIndex (indexData: Index) {
    // Apply column sorting if any sorters are defined in options
    if ('columnSorting' in indexData.options && Object.keys(indexData.options.columnSorting).length) {
      for (const columnName in indexData.options.columnSorting) {
        indexData = indexData.sortColumn(
          await this.loadAllTrackedTasks(indexData, columnName),
          columnName,
          indexData.options.columnSorting[columnName]
        )
      }
    }

    // If there is a separate config file, save options to this file
    let ignoreOptions = false
    if (await this.configExists()) {
      await this.saveConfig(indexData.options)
      ignoreOptions = true
    }

    // Save index
    await fs.promises.writeFile(await this.getIndexPath(), parseIndex.json2md(indexData, ignoreOptions))
  }

  /**
   * Check if a task file exists and is in the index, otherwise throw an error
   * @param {string} taskId The task id to check
   */
  async taskExists (taskId: TaskId) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Check if the task file exists
    if (!fs.existsSync(getTaskPath(await this.getTaskFolderPath(), taskId))) {
      throw new Error(`No task file found with id "${taskId}"`)
    }

    // Check that the task is indexed
    const index = await this.loadIndex()
    if (!index.contains(taskId)) {
      throw new Error(`No task with id "${taskId}" found in the index`)
    }
  }

  /**
   * Get the column that a task is in or throw an error if the task doesn't exist or isn't indexed
   * @param {string} taskId The task id to find
   * @return {Promise<string>} The name of the column the task is in
   */
  async findTaskColumn (taskId: TaskId) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Check if the task file exists
    if (!fs.existsSync(getTaskPath(await this.getTaskFolderPath(), taskId))) {
      throw new Error(`No task file found with id "${taskId}"`)
    }

    // Check that the task is indexed
    const index = await this.loadIndex()
    if (!index.contains(taskId)) {
      throw new Error(`No task with id "${taskId}" found in the index`)
    }

    // Find which column the task is in
    return index.findTaskColumn(taskId)
  }

  /**
   * Create a task file and add the task to the index
   * @param {object} taskData The task object
   * @param {string} columnName The name of the column to add the task to
   * @return {Promise<string>} The id of the task that was created
   */
  async createTask (taskData: Task, columnName:string) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Make sure the task has a name
    if (!taskData.name) {
      throw new Error('Task name cannot be blank')
    }

    // Make sure a task doesn't already exist with the same name
    const taskId = utility.getTaskId(taskData.name)
    const taskPath = getTaskPath(await this.getTaskFolderPath(), taskId)
    if (fs.existsSync(taskPath)) {
      throw new Error(`A task with id "${taskId}" already exists`)
    }

    // Get index and make sure the column exists
    let index = await this.loadIndex()
    if (!(columnName in index.columns)) {
      throw new Error(`Column "${columnName}" doesn't exist`)
    }

    // Check that a task with the same id isn't already indexed
    if (index.contains(taskId)) {
      throw new Error(`A task with id "${taskId}" is already in the index`)
    }

    // Set the created date
    taskData.metadata.created = new Date()

    // Update task metadata dates
    taskData = index.updateColumnLinkedCustomFields(taskData, columnName)
    await this.saveTask(taskPath, taskData)

    // Add the task to the index
    index = index.addTask(taskId, columnName)
    await this.saveIndex(index)
    return taskId
  }

  /**
   * Add an untracked task to the specified column in the index
   * @param {string} taskId The untracked task id
   * @param {string} columnName The column to add the task to
   * @return {Promise<string>} The id of the task that was added
   */
  async addUntrackedTaskToIndex (taskId: TaskId, columnName: string) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }
    taskId = removeFileExtension(taskId)

    // Make sure the task file exists
    if (!fs.existsSync(getTaskPath(await this.getTaskFolderPath(), taskId))) {
      throw new Error(`No task file found with id "${taskId}"`)
    }

    // Get index and make sure the column exists
    let index = await this.loadIndex()
    if (!(columnName in index.columns)) {
      throw new Error(`Column "${columnName}" doesn't exist`)
    }

    // Check that the task isn't already indexed
    if (index.contains(taskId)) {
      throw new Error(`Task "${taskId}" is already in the index`)
    }

    // Load task data
    let taskData = await this.loadTask(taskId)
    const taskPath = getTaskPath(await this.getTaskFolderPath(), taskId)

    // Update task metadata dates
    taskData = index.updateColumnLinkedCustomFields(taskData, columnName)
    await this.saveTask(taskPath, taskData)

    // Add the task to the column and save the index
    index = index.addTask(taskId, columnName)
    await this.saveIndex(index)
    return taskId
  }

  /**
   * Get a list of tracked tasks (i.e. tasks that are listed in the index)
   * @param {?string} [columnName=null] The optional column name to filter tasks by
   * @return {Promise<Set>} A set of task ids
   */
  async findTrackedTasks (columnName = null) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Get all tasks currently in index
    const index = await this.loadIndex()
    return index.getTrackedTaskIds(columnName)
  }

  /**
   * Get a list of untracked tasks (i.e. markdown files in the tasks folder that aren't listed in the index)
   * @return {Promise<Set>} A set of untracked task ids
   */
  async findUntrackedTasks () {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Get all tasks currently in index
    const index = await this.loadIndex()
    const trackedTasks = index.getTrackedTaskIds()

    // Get all tasks in the tasks folder
    const files: string[] = await glob(`${await this.getTaskFolderPath()}/*.md`)
    const untrackedTasks = new Set(files.map((task) => path.parse(task).name))

    // Return the set difference
    return new Set([...untrackedTasks].filter((x) => !trackedTasks.has(x)))
  }

  /**
   * Update an existing task
   * @param {string} taskId The id of the task to update
   * @param {object} taskData The new task data
   * @param {?string} [columnName=null] The column name to move this task to, or null if not moving this task
   * @return {Promise<string>} The id of the task that was updated
   */
  async updateTask (taskId: TaskId, taskData: TaskData, columnName: string | null = null) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }
    taskId = removeFileExtension(taskId)

    // Make sure the task file exists
    if (!fs.existsSync(getTaskPath(await this.getTaskFolderPath(), taskId))) {
      throw new Error(`No task file found with id "${taskId}"`)
    }

    // Get index and make sure the task is indexed
    let index = await this.loadIndex()
    if (!index.contains(taskId)) {
      throw new Error(`Task "${taskId}" is not in the index`)
    }

    // Make sure the updated task data has a name
    if (!taskData.name) {
      throw new Error('Task name cannot be blank')
    }

    // Rename the task if we're updating the name
    const originalTaskData = await this.loadTask(taskId)
    if (originalTaskData.name !== taskData.name) {
      taskId = await this.renameTask(taskId, taskData.name)

      // Re-load the index
      index = await this.loadIndex()
    }

    // Get index and make sure the column exists
    if (columnName && !(columnName in index.columns)) {
      throw new Error(`Column "${columnName}" doesn't exist`)
    }

    // Set the updated date
    taskData.metadata.updated = new Date()

    // Save task
    await this.saveTask(getTaskPath(await this.getTaskFolderPath(), taskId), taskData)

    // Move the task if we're updating the column
    if (columnName) {
      await this.moveTask(taskId, columnName)

      // Otherwise save the index
    } else {
      await this.saveIndex(index)
    }
    return taskId
  }

  /**
   * Change a task name, rename the task file and update the task id in the index
   * @param {string} taskId The id of the task to rename
   * @param {string} newTaskName The new task name
   * @return {Promise<string>} The new id of the task that was renamed
   */
  async renameTask (taskId: TaskId, newTaskName: string) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }
    taskId = removeFileExtension(taskId)

    // Make sure the task file exists
    if (!fs.existsSync(getTaskPath(await this.getTaskFolderPath(), taskId))) {
      throw new Error(`No task file found with id "${taskId}"`)
    }

    // Get index and make sure the task is indexed
    let index = await this.loadIndex()
    if (!index.contains(taskId)) {
      throw new Error(`Task "${taskId}" is not in the index`)
    }

    // Make sure there isn't already a task with the new task id
    const newTaskId = utility.getTaskId(newTaskName)
    const newTaskPath = getTaskPath(await this.getTaskFolderPath(), newTaskId)
    if (fs.existsSync(newTaskPath)) {
      throw new Error(`A task with id "${newTaskId}" already exists`)
    }

    // Check that a task with the new id isn't already indexed
    if (index.contains(newTaskId)) {
      throw new Error(`A task with id "${newTaskId}" is already in the index`)
    }

    // Update the task name and updated date
    let taskData = await this.loadTask(taskId)
    taskData.name = newTaskName
    taskData.metadata.updated = new Date()
    await this.saveTask(getTaskPath(await this.getTaskFolderPath(), taskId), taskData)

    // Rename the task file
    await fs.promises.rename(getTaskPath(await this.getTaskFolderPath(), taskId), newTaskPath)

    // Update the task id in the index
    index = index.renameTask(taskId, newTaskId)
    await this.saveIndex(index)
    return newTaskId
  }

  /**
   * Move a task from one column to another column
   * @param {string} taskId The task id to move
   * @param {string} columnName The name of the column that the task will be moved to
   * @param {?number} [position=null] The position to move the task to within the target column
   * @param {boolean} [relative=false] Treat the position argument as relative instead of absolute
   * @return {Promise<string>} The id of the task that was moved
   */
  async moveTask (taskId: TaskId, columnName: string, position: number | null = null, relative: boolean = false) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }
    taskId = removeFileExtension(taskId)

    // Make sure the task file exists
    if (!fs.existsSync(getTaskPath(await this.getTaskFolderPath(), taskId))) {
      throw new Error(`No task file found with id "${taskId}"`)
    }

    // Get index and make sure the task is indexed
    let index = await this.loadIndex()
    if (!index.contains(taskId)) {
      throw new Error(`Task "${taskId}" is not in the index`)
    }

    // Make sure the target column exists
    if (!(columnName in index.columns)) {
      throw new Error(`Column "${columnName}" doesn't exist`)
    }

    // Update the task's updated date
    let taskData = await this.loadTask(taskId)
    taskData.metadata.updated = new Date()

    // Update task metadata dates
    taskData = index.updateColumnLinkedCustomFields(taskData, columnName)
    await this.saveTask(getTaskPath(await this.getTaskFolderPath(), taskId), taskData)

    // If we're moving the task to a new position, calculate the absolute position
    const currentColumnName = index.findTaskColumn(taskId)
    const currentPosition = index.columns[currentColumnName ?? ""]?.indexOf(taskId)
    if (position) {
      if (relative) {
        position = currentPosition + position
      }
      position = Math.max(Math.min(position ?? -1, index.columns[currentColumnName ?? ""]?.length), 0)
    }

    // Remove the task from its current column and add it to the new column
    index = index.removeTask(taskId)
    index = index.addTask(taskId, columnName, position)
    await this.saveIndex(index)
    return taskId
  }

  /**
   * Remove a task from the index and optionally delete the task file as well
   * @param {string} taskId The id of the task to remove
   * @param {boolean} [removeFile=false] True if the task file should be removed
   * @return {Promise<string>} The id of the task that was deleted
   */
  async deleteTask (taskId: TaskId, removeFile: boolean = false) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }
    taskId = removeFileExtension(taskId)

    // Get index and make sure the task is indexed
    let index = await this.loadIndex()
    if (!index.contains(taskId)) {
      throw new Error(`Task "${taskId}" is not in the index`)
    }

    // Remove the task from whichever column it's in
    index = index.removeTask(taskId)

    // Optionally remove the task file as well
    if (removeFile && fs.existsSync(getTaskPath(await this.getTaskFolderPath(), taskId))) {
      await fs.promises.unlink(getTaskPath(await this.getTaskFolderPath(), taskId))
    }
    await this.saveIndex(index)
    return taskId
  }

  /**
   * Search for indexed tasks
   * @param {object} [filters={}] The filters to apply
   * @param {boolean} [quiet=false] Only return task ids if true, otherwise return full task details
   * @return {Promise<object[]>} A list of tasks that match the filters
   */
  async search (filters: Filter = EMPTY_FILTER, quiet = false) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Load all tracked tasks and filter the results
    const index = await this.loadIndex()
    const tasks = index.filterTasks(await this.loadAllTrackedTasks(index), filters)

    // Return resulting task ids or the full tasks
    return tasks.map((task) => {
      return quiet ? utility.getTaskId(task.name) : this.hydrateTask(index, task)
    })
  }
  
  /**
   * Output project status information
   * @param {boolean} [quiet=false] Output full or partial status information
   * @param {boolean} [untracked=false] Show a list of untracked tasks
   * @param {boolean} [due=false] Show information about overdue tasks and time remaining
   * @param {?string|?number} [sprint=null] The sprint name or number to show stats for, or null for current sprint
   * @param {?Date[]} [dates=null] The date(s) to show stats for, or null for no date filter
   * @return {Promise<object|string[]>} Project status information as an object, or an array of untracked task filenames
   */
  async status (quiet: boolean = false, untracked: boolean = false, due: boolean = false, sprint: string | number | null = null, dates: Date[] | null = null): Promise<StatusInfo | string[]> {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Get index and column names
    const index: Index = await this.loadIndex()
    const columnNames = Object.keys(index.columns)

    // Prepare output
    // const result: StatusInfo = {
    //   name: index.name
    // }

    // Get un-tracked tasks if required
    let untrackedTasks: TaskId[] | null = null
    if (untracked) {
      untrackedTasks = [...(await this.findUntrackedTasks())].map((taskId) => `${taskId}.md`)

      // If output is quiet, output a list of untracked task filenames
      if (quiet) {
        return untrackedTasks
      }
    }

    // Get basic project status information
    const tasks = columnNames.reduce((a, v) => a + index.columns[v].length, 0)
    const columnTasks = Object.fromEntries(
      columnNames.map((columnName) => [columnName, index.columns[columnName].length])
    )
    let startedTasks: number = 0
    if ('startedColumns' in index.options && index.options.startedColumns.length > 0) {
      startedTasks = Object.entries(index.columns)
        .filter((c) => index.options.startedColumns.indexOf(c[0]) > -1)
        .reduce((a, c) => a + c[1].length, 0)
    }
    let completedTasks: number = 0
    if ('completedColumns' in index.options && index.options.completedColumns.length > 0) {
      completedTasks = Object.entries(index.columns)
        .filter((c) => index.options.completedColumns.indexOf(c[0]) > -1)
        .reduce((a, c) => a + c[1].length, 0)
    }
    let dueTasks: any = null
    let resultTotalWorkload: number = 0
    let resultTotalRemainingWorkload: number = 0
    let resultColumnWorkloads: null | Record<string, any> = null
    let taskWorkloads: null | any = null
    let resultAssigned: null | Record<string, any> = null
    interface SprintInfo {
      number: number
      name: string
      start: null | Date
      end: null | Date
      current: null | number
      description: string
      durationDelta: null | number
      durationMessage: null | string
      created: any | null
      completed: any | null
      started: any | null
      due: any | null,
      customFields: Record<string, any>
    }
    let resultPeriod: {
      start: Date
      end: Date
      created: any | null
      started: any | null
      completed: any | null
      due: any | null
    } = {
      start: new Date(),
      end: new Date(),
      created: null,
      started: null,
      completed: null,
      due: null
    }
    let resultSprint: any = {
      number: 0,
      name: '',
      start: null,
      end: null,
      current: null,
      description: "",
      durationDelta: null,
      durationMessage: null,
      completed: null,
      created: null,
      started: null,
      due: null,
      customFields: {}
    }
    // If required, load more detailed task information
    if (!quiet) {
      // Load all tracked tasks and hydrate them
      const tasks = [...(await this.loadAllTrackedTasks(index))].map((task) => this.hydrateTask(index, task))

      // If showing due information, calculate time remaining or overdue time for each task
      if (due) {
        dueTasks = []
        tasks.forEach((task) => {
          if ('dueData' in task) {
            dueTasks.push({
              task: task.id,
              workload: task.workload,
              progress: task.progress,
              remainingWorkload: task.remainingWorkload,
              ...task.dueData
            })
          }
        })
      }

      // Calculate total and per-column workload
      resultColumnWorkloads = tasks.reduce(
        (a, task) => {
          resultTotalWorkload += task.workload
          resultTotalRemainingWorkload += task.remainingWorkload
          a[task.column ?? ''].workload += task.workload
          a[task.column ?? ''].remainingWorkload += task.remainingWorkload
          return a
        },
        Object.fromEntries(
          columnNames.map((columnName) => [
            columnName,
            {
              workload: 0,
              remainingWorkload: 0
            }
          ])
        )
      )
      taskWorkloads = Object.fromEntries(
        tasks.map((task) => [
          task.id,
          {
            workload: task.workload,
            progress: task.progress,
            remainingWorkload: task.remainingWorkload,
            completed: index.taskCompleted(task)
          }
        ])
      )

      // Calculate assigned task totals and workloads
      const assignedTasks = tasks.reduce((a: Record<string, any>, task) => {
        if ('assigned' in task.metadata) {
          if (!(task.metadata.assigned in a)) {
            a[task.metadata.assigned] = {
              total: 0,
              workload: 0,
              remainingWorkload: 0
            }
          }
          a[task.metadata.assigned].total++
          a[task.metadata.assigned].workload += task.workload
          a[task.metadata.assigned].remainingWorkload += task.remainingWorkload
        }
        return a
      }, {})
      // if (Object.keys(assignedTasks).length > 0) {
        resultAssigned = assignedTasks
      // }

      // If any sprints are defined in index options, calculate sprint statistics
      if (index.options.sprints.length) {
        const sprints: Sprint[] = index.options.sprints

        // Default to current sprint
        const currentSprint = index.options.sprints.length
        let sprintIndex = currentSprint - 1

        // Check if we're requesting stats for a specific sprint
        if (sprint !== null) {
          // Select sprint by number (1-based index)
          if (typeof sprint === 'number') {
            if (sprint < 1 || sprint > sprints.length) {
              throw new Error(`Sprint ${sprint} does not exist`)
            } else {
              sprintIndex = sprint - 1
            }

            // Or select sprint by name
          } else if (typeof sprint === 'string') {
            sprintIndex = sprints.findIndex((s) => s.name === sprint)
            if (sprintIndex === -1) {
              throw new Error(`No sprint found with name "${sprint}"`)
            }
          }
        }

        // Add sprint information
        resultSprint = {
          number: sprintIndex + 1,
          name: sprints[sprintIndex].name,
          start: sprints[sprintIndex].start,
          end: null,
          current: null,
          description: "",
          durationDelta: null,
          durationMessage: null,
          completed: null,
          created: null,
          started: null,
          due: null,
          customFields: {}
        }
        if (currentSprint - 1 !== sprintIndex) {
          if (sprintIndex === sprints.length - 1) {
            resultSprint.end = sprints[sprintIndex + 1].start
          }
          resultSprint.current = currentSprint
        }
        if (sprints[sprintIndex].description) {
          resultSprint.description = sprints[sprintIndex].description
        }
        const sprintStartDate = sprints[sprintIndex].start
        const sprintEndDate = sprintIndex === sprints.length - 1 ? new Date() : sprints[sprintIndex + 1].start

        // Calculate sprint duration
        const duration = sprintEndDate.valueOf() - sprintStartDate.valueOf()
        resultSprint.durationDelta = duration
        resultSprint.durationMessage = humanizeDuration(duration, {
          largest: 3,
          round: true
        })

        // Add task workload information for the sprint
        resultSprint.created = taskWorkloadInPeriod(tasks, 'created', sprintStartDate, sprintEndDate)
        resultSprint.started = taskWorkloadInPeriod(tasks, 'started', sprintStartDate, sprintEndDate)
        resultSprint.completed = taskWorkloadInPeriod(tasks, 'completed', sprintStartDate, sprintEndDate)
        resultSprint.due = taskWorkloadInPeriod(tasks, 'due', sprintStartDate, sprintEndDate)

        // Add custom date property workload information for the sprint
        // if ('customFields' in index.options) {
          for (const customField of index.options.customFields) {
            if (customField.type === 'date') {
              resultSprint.customFields[customField.name] = taskWorkloadInCustomPeriod(
                tasks,
                customField.name,
                sprintStartDate,
                sprintEndDate
              )
            }
          }
        // }
      }
      
      // If any dates were specified, calculate task statistics for these dates
      if (dates !== null && dates.length > 0) {
        let periodStart, periodEnd
        if (dates.length === 1) {
          periodStart = new Date(+dates[0])
          periodStart.setHours(0, 0, 0, 0)
          periodEnd = new Date(+dates[0])
          periodEnd.setHours(23, 59, 59, 999)
          resultPeriod.start = periodStart
          resultPeriod.end = periodEnd
        } else {
          resultPeriod.start = periodStart = new Date(Math.min(...dates.map((d) => d.valueOf())))
          resultPeriod.end = periodEnd = new Date(Math.max(...dates.map((d) => d.valueOf())))
        }
        resultPeriod.created = taskWorkloadInPeriod(tasks, 'created', periodStart, periodEnd)
        resultPeriod.started = taskWorkloadInPeriod(tasks, 'started', periodStart, periodEnd)
        resultPeriod.completed = taskWorkloadInPeriod(tasks, 'completed', periodStart, periodEnd)
        resultPeriod.due = taskWorkloadInPeriod(tasks, 'due', periodStart, periodEnd)
      }
    }
    return {
      name: index.name,
      untrackedTasks,
      sprint: resultSprint,
      period: resultPeriod,
      assigned: resultAssigned,
      dueTasks,
      totalWorkload: resultTotalWorkload,
      totalRemainingWorkload: resultTotalRemainingWorkload,
      columnWorkloads: resultColumnWorkloads,
      taskWorkloads,
      startedTasks,
      completedTasks
    }
  }

  /**
   * Validate the index and task files
   * @param {boolean} [save=false] Re-save all files
   * @return {Promise<boolean>} True if everything validated, otherwise an array of parsing errors
   */
  async validate (save = false) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }
    const errors: any[] = []

    // Load & parse index
    let index: any = null
    try {
      index = await this.loadIndex()

      // Re-save index if required
      if (save) {
        await this.saveIndex(index)
      }
    } catch (error: any) {
      errors.push({
        task: null,
        errors: error.message
      })
    }

    // Exit early if any errors were found in the index
    if (errors.length) {
      return errors
    }

    // Load & parse tasks
    const trackedTasks = index !== null ? index.getTrackedTaskIds() : []
    for (const taskId of trackedTasks) {
      try {
        const task = await this.loadTask(taskId)

        // Re-save tasks if required
        if (save) {
          await this.saveTask(getTaskPath(await this.getTaskFolderPath(), taskId), task)
        }
      } catch (error: any) {
        errors.push({
          task: taskId,
          errors: error.message
        })
      }
    }

    // Return a list of errors or true if there were no errors
    if (errors.length) {
      return errors
    }
    return true
  }

  /**
   * Sort a column in the index
   * @param {string} columnName The column name to sort
   * @param {object[]} sorters A list of objects containing the field to sort by, filters and sort order
   * @param {boolean} [save=false] True if the settings should be saved in index
   */
  async sort (columnName: string, sorters: Sorter[], save = false) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Get index and make sure the column exists
    let index = await this.loadIndex()
    if (!(columnName in index.columns)) {
      throw new Error(`Column "${columnName}" doesn't exist`)
    }

    // Save the sorter settings if required (the column will be sorted when saving the index)
    if (save) {
      index.options.columnSorting[columnName] = sorters

      // Otherwise, remove sorting settings for the specified column and manually sort the column
    } else {
      if ('columnSorting' in index.options && columnName in index.options.columnSorting) {
        delete index.options.columnSorting[columnName]
      }
      const tasks = await this.loadAllTrackedTasks(index, columnName)
      index = index.sortColumn(tasks, columnName, sorters)
    }
    await this.saveIndex(index)
  }

  /**
   * Start a sprint
   * @param {string} name Sprint name
   * @param {string} description Sprint description
   * @param {Date} start Sprint start date
   * @return {Promise<object>} The sprint object
   */
  async sprint (name: string, description: string, start: Date) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Get index and make sure it has a list of sprints in the options
    const index = await this.loadIndex()
    const sprintNumber = index.options.sprints.length + 1
    const sprint: Sprint = {
      start,
      name /*?? `Sprint ${sprintNumber}`*/,
      description,
      number: sprintNumber
    }

    // Add sprint and save the index
    index.options.sprints.push(sprint)
    await this.saveIndex(index)
    return sprint
  }

  /**
   * Output burndown chart data
   * @param {?string[]} [sprints=null] The sprint names or numbers to show a chart for, or null for
   * the current sprint
   * @param {?Date[]} [dates=null] The dates to show a chart for, or null for no date filter
   * @param {?string} [assigned=null] The assigned user to filter for, or null for no assigned filter
   * @param {?string[]} [columns=null] The columns to filter for, or null for no column filter
   * @param {?string} [normalise=null] The date normalisation mode
   * @return {Promise<object>} Burndown chart data as an object
   */
  async burndown (sprints: null | string[] = null, dates: null | Date[] = null, assigned: string | null = null, columns: string[] | null = null, normalise: string | null = null) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Get index and tasks
    const index = await this.loadIndex()
    const tasks = [...(await this.loadAllTrackedTasks(index))]
      .map((task) => {
        const created = 'created' in task.metadata ? task.metadata.created : new Date(0)
        return {
          ...task,
          created,
          started:
            'started' in task.metadata
              ? task.metadata.started
              : 'startedColumns' in index.options && index.options.startedColumns.indexOf(task.column ?? '') !== -1
                ? created
                : null,
          completed:
            'completed' in task.metadata
              ? task.metadata.completed
              : 'completedColumns' in index.options && index.options.completedColumns.indexOf(task.column ?? '') !== -1
                ? created
                : null,
          progress: index.taskProgress(task),
          assigned: 'assigned' in task.metadata ? task.metadata.assigned : null,
          workload: index.taskWorkload(task),
          column: index.findTaskColumn(task.id)
        }
      })
      .filter(
        (task) =>
          (assigned === null || task.assigned === assigned) &&
          (columns === null || columns.indexOf(task?.column ?? '') !== -1)
      )

    // Get sprints and dates to plot from arguments
    interface SeriesElement {
      sprint?: Sprint | null
      from: Date
      to: Date
      dataPoints: any[]
    }
    const series: SeriesElement[] = []
    const indexSprints = 'sprints' in index.options && index.options.sprints.length ? index.options.sprints : null
    if (sprints === null && dates === null) {
      if (indexSprints !== null) {
        // Show current sprint
        const currentSprint = indexSprints.length - 1
        series.push({
          sprint: indexSprints[currentSprint],
          from: new Date(indexSprints[currentSprint].start),
          to: new Date(),
          dataPoints: []
        })
      } else {
        // Show all time
        series.push({
          from: new Date(
            Math.min(
              ...tasks
                .map((t: any) =>
                  [
                    'created' in t.metadata && t.metadata.created,
                    'started' in t.metadata && t.metadata.started,
                    'completed' in t.metadata && (t.metadata.completed ?? new Date(8640000000000000))
                  ].filter((d) => d !== false && d !== null)
                )
                .flat().map((d: Date) => d.getTime())
            )
          ),
          to: new Date(),
          dataPoints: []
        })
      }
    } else {
      // Show specified sprint
      if (sprints !== null) {
        if (indexSprints === null) {
          throw new Error('No sprints defined')
        } else {
          for (const sprint of sprints) {
            let sprintIndex: number | null = null

            // Select sprint by number (1-based index)
            if (typeof sprint === 'number') {
              if (sprint < 1 || sprint > indexSprints.length) {
                throw new Error(`Sprint ${sprint} does not exist`)
              } else {
                sprintIndex = sprint - 1
              }

              // Or select sprint by name
            } else if (typeof sprint === 'string') {
              sprintIndex = indexSprints.findIndex((s) => s.name === sprint)
              if (sprintIndex === -1) {
                throw new Error(`No sprint found with name "${sprint}"`)
              }
            }
            if (sprintIndex === null) {
              throw new Error(`Invalid sprint "${sprint}"`)
            }

            // Get sprint start and end
            series.push({
              sprint: indexSprints[sprintIndex],
              from: new Date(indexSprints[sprintIndex].start),
              to: sprintIndex < indexSprints.length - 1 ? new Date(indexSprints[sprintIndex + 1].start) : new Date(),
              dataPoints: []
            })
          }
        }
      }

      // Show specified date range
      if (dates !== null) {
        series.push({
          sprint: null,
          from: new Date(Math.min(...dates.map((d) => d.valueOf()))),
          to: dates.length === 1 ? new Date() : new Date(Math.max(...dates.map((d) => d.valueOf()))),
          dataPoints: []
        })
      }
    }

    // If normalise mode is 'auto', find the most appropriate normalisation mode
    if (normalise === 'auto') {
      const delta = series[0].to.valueOf() - series[0].from.valueOf()
      if (delta >= DAY * 7) {
        normalise = 'days'
      } else if (delta >= DAY) {
        normalise = 'hours'
      } else if (delta >= HOUR) {
        normalise = 'minutes'
      } else {
        normalise = 'seconds'
      }
    }
    if (normalise !== null) {
      // Normalize series from and to dates
      series.forEach((s) => {
        s.from = normaliseDate(s.from, normalise!)
        s.to = normaliseDate(s.to, normalise!)
      })

      // Normalise task dates
      tasks.forEach((task) => {
        if (task.created) {
          task.created = normaliseDate(task.created, normalise!)
        }
        if (task.started !== null) {
          task.started = normaliseDate(task.started, normalise!)
        }
        if (task.completed) {
          task.completed = normaliseDate(task.completed, normalise!)
        }
      })
    }

    // Get workload datapoints for each period
    series.forEach((s) => {
      s.dataPoints = [
        {
          x: s.from,
          y: getWorkloadAtDate((tasks as any), s.from),
          count: countActiveTasksAtDate((tasks as any), s.from),
          tasks: getTaskEventsAtDate((tasks as any), s.from)
        },
        ...tasks
          .filter((task) => {
            let result = false
            if (task.created && task.created >= s.from && task.created <= s.to) {
              result = true
            }
            if (task.started && task.started >= s.from && task.started <= s.to) {
              result = true
            }
            if (task.completed && task.completed >= s.from && task.completed <= s.to) {
              result = true
            }
            return result
          })
          .map((task) => [
            task.created,
            task.started,
            task.completed
          ])
          .flat()
          .filter((d: Date | null) => d !== null)
          .map((x: any) => ({
            x,
            y: getWorkloadAtDate((tasks as any), x),
            count: countActiveTasksAtDate((tasks as any), x),
            tasks: getTaskEventsAtDate((tasks as any), x)
          })),
        {
          x: s.to,
          y: getWorkloadAtDate((tasks as any), s.to),
          count: countActiveTasksAtDate((tasks as any), s.to),
          tasks: getTaskEventsAtDate((tasks as any), s.to)
        }
      ].sort((a, b) => a.x.getTime() - b.x.getTime())
    })
    return { series }
  }

  /**
   * Add a comment to a task
   * @param {string} taskId The task id
   * @param {string} text The comment text
   * @param {string} author The comment author
   * @return {Promise<string>} The task id
   */
  async comment (taskId: TaskId, text: string, author: string) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }
    taskId = removeFileExtension(taskId)

    // Make sure the task file exists
    if (!fs.existsSync(getTaskPath(await this.getTaskFolderPath(), taskId))) {
      throw new Error(`No task file found with id "${taskId}"`)
    }

    // Get index and make sure the task is indexed
    const index = await this.loadIndex()
    if (!index.contains(taskId)) {
      throw new Error(`Task "${taskId}" is not in the index`)
    }

    // Make sure the comment text isn't empty
    if (!text) {
      throw new Error('Comment text cannot be empty')
    }

    // Add the comment
    const taskData = await this.loadTask(taskId)
    const taskPath = getTaskPath(await this.getTaskFolderPath(), taskId)
    taskData.comments.push({
      text,
      author,
      date: new Date()
    })

    // Save the task
    await this.saveTask(taskPath, taskData)
    return taskId
  }

  /**
   * Return a list of archived tasks
   * @return {Promise<string[]>} A list of archived task ids
   */
  async listArchivedTasks () {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }

    // Make sure the archive folder exists
    const archiveFolder = await this.getArchiveFolderPath()
    if (!fs.existsSync(archiveFolder)) {
      throw new Error("Archive folder doesn't exist")
    }

    // Get a list of archived task files
    const files = await glob(`${archiveFolder}/*.md`)
    return [...new Set(files.map((task: any) => path.parse(task).name))]
  }

  /**
   * Move a task to the archive
   * @param {string} taskId The task id
   * @return {Promise<string>} The task id
   */
  async archiveTask (taskId: TaskId) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }
    taskId = removeFileExtension(taskId)

    // Make sure the task file exists
    if (!(await fs.existsSync(getTaskPath(await this.getTaskFolderPath(), taskId)))) {
      throw new Error(`No task file found with id "${taskId}"`)
    }

    // Get index and make sure the task is indexed
    const index = await this.loadIndex()
    if (!index.contains(taskId)) {
      throw new Error(`Task "${taskId}" is not in the index`)
    }

    // Make sure there isn't already an archived task with the same id
    const archiveFolder = await this.getArchiveFolderPath()
    const archivedTaskPath = getTaskPath(archiveFolder, taskId)
    if (fs.existsSync(archivedTaskPath)) {
      throw new Error(`An archived task with id "${taskId}" already exists`)
    }

    // Create archive folder if it doesn't already exist
    if (!fs.existsSync(archiveFolder)) {
      await fs.promises.mkdir(archiveFolder, { recursive: true })
    }

    // Save the column name in the task's metadata
    let taskData = await this.loadTask(taskId)
    taskData.metadata.column = index.findTaskColumn(taskId)

    // Save the task inside the archive folder
    await this.saveTask(archivedTaskPath, taskData)

    // Remove the original task
    await this.deleteTask(taskId, true)

    return taskId
  }

  /**
   * Restore a task from the archive
   * @param {string} taskId The task id
   * @param {?string} [columnName=null] The column to restore the task to
   * @return {Promise<string>} The task id
   */
  async restoreTask (taskId: TaskId, columnName: string | null = null) {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }
    taskId = removeFileExtension(taskId)

    const archiveFolder = await this.getArchiveFolderPath()
    const archivedTaskPath = getTaskPath(archiveFolder, taskId)
    const taskPath = getTaskPath(await this.getTaskFolderPath(), taskId)

    // Make sure the archive folder exists
    if (!fs.existsSync(archiveFolder)) {
      throw new Error("Archive folder doesn't exist")
    }

    // Make sure the task file exists in the archive
    if (!fs.existsSync(archivedTaskPath)) {
      throw new Error(`No archived task found with id "${taskId}"`)
    }

    // Get index and make sure there isn't already an indexed task with the same id
    let index = await this.loadIndex()
    if (index.contains(taskId)) {
      throw new Error(`There is already an indexed task with id "${taskId}"`)
    }

    // Check if there is already a task with the same id
    if (fs.existsSync(taskPath)) {
      throw new Error(`There is already an untracked task with id "${taskId}"`)
    }

    // Make sure the index has some columns
    const columns = Object.keys(index.columns)
    if (columns.length === 0) {
      throw new Error('No columns defined in the index')
    }

    // Load the task from the archive
    let taskData = await this.loadArchivedTask(taskId)
    const actualColumnName = columnName ?? taskData.metadata.columns[0] ?? columns[0]
    taskData.metadata.column = null

    // Update task metadata dates and save task
    taskData = index.updateColumnLinkedCustomFields(taskData, actualColumnName)
    await this.saveTask(taskPath, taskData)

    // Add the task to the column and save the index
    index = index.addTask(taskId, actualColumnName)
    await this.saveIndex(index)

    // Delete the archived task file
    await fs.promises.unlink(archivedTaskPath)

    return taskId
  }

  /**
   * Nuke it from orbit, it's the only way to be sure
   */
  async removeAll () {
    // Check if this folder has been initialised
    if (!(await this.initialised())) {
      throw new Error('Not initialised in this folder')
    }
    rimraf.sync(await this.getMainFolder())
  }
};
