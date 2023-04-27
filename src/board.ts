import { Index } from './model/Index'
import { Kanbn } from './model/Kanbn'
import { Task } from './model/Task'
const term = require('terminal-kit').terminal
const formatDate = require('dateformat')
import * as utility from './utility'

const kanbn = new Kanbn()

  const TASK_SEPARATOR = '\n\n'

  /**
   * Show only the selected fields for a task, as specified in the index options
   * @param {object} index
   * @param {object} task
   * @return {string} The selected task fields
   */
  function getTaskString (index: Index, task: Task) {
    const taskTemplate = kanbn.getTaskTemplate(index)
    const dateFormat = kanbn.getDateFormat(index)

    // Get an object containing custom fields from the task
    let customFields = {}
    if ('customFields' in index.options) {
      const customFieldNames = index.options.customFields.map(customField => customField.name)
      customFields = Object.fromEntries(utility.zip(
        customFieldNames,
        customFieldNames.map((customFieldName: string) => (task.metadata as any)[customFieldName] ?? '')
      ))
    }

    // Prepare task data for interpolation
    const taskData = {
      name: task.name,
      description: task.name,
      created: 'created' in task.metadata ? formatDate(task.metadata.created, dateFormat) : '',
      updated: 'updated' in task.metadata ? formatDate(task.metadata.updated, dateFormat) : '',
      started: 'started' in task.metadata ? formatDate(task.metadata.started, dateFormat) : '',
      completed: 'completed' in task.metadata ? formatDate(task.metadata.completed, dateFormat) : '',
      due: 'due' in task.metadata ? formatDate(task.metadata.due, dateFormat) : '',
      tags: 'tags' in task.metadata ? task.metadata.tags : [],
      subTasks: task.subTasks,
      relations: task.relations,
      overdue: 'dueData' in task && 'overdue' in task.dueData ? task.dueData.overdue : null,
      dueDelta: 'dueData' in task && 'dueDelta' in task.dueData ? task.dueData.dueDelta : 0,
      dueMessage: 'dueData' in task && 'dueMessage' in task.dueData ? task.dueData.dueMessage : '',
      column: task.column,
      workload: task.workload,
      progress: task.progress,
      ...customFields
    }
    try {
      // eslint-disable-next-line no-new-func
      return new Function(...Object.keys(taskData), 'return `^:' + taskTemplate + '`;')(...Object.values(taskData))
    } catch (e: any) {
      utility.error(`Unable to build task template: ${e.message}`)
    }
  }

  /**
   * Get a column heading with icons
   * @param {object} index
   * @param {string} columnName
   * @return {string} The column heading
   */
  function getColumnHeading (index: Index, columnName: string) {
    let heading = '^:'
    if (
      'completedColumns' in index.options &&
      index.options.completedColumns.indexOf(columnName) !== -1
    ) {
      heading += '^g\u2713^: '
    }
    if (
      'startedColumns' in index.options &&
      index.options.startedColumns.indexOf(columnName) !== -1
    ) {
      heading += '^c\u00bb^: '
    }
    return heading + `^+${columnName}^:`
  }

  

    /**
     * Show the kanbn board
     * @param {object} index The index object
     * @param {object[]} tasks An array of task objects
     * @param {?string} [view=null] The view to show, or null to show the default view
     * @param {boolean} [json=false] Show JSON output
     */
    export async function show (index: Index, tasks: Task[], view: string | null = null, json: boolean = false) {
      const board: any = {}
      let viewSettings: any = {}
      if (view !== null) {
        // Make sure the view exists
        if (
          !('views' in index.options) ||
          (viewSettings = (index.options.views as any).find((v: any) => v.name === view)) === undefined
        ) {
          throw new Error(`No view found with name "${view}"`)
        }
      }

      // Check if there is a list of columns in the view settings
      if (!('columns' in viewSettings)) {
        viewSettings.columns = Object.keys(index.columns)
          .filter(columnName => (
            !('hiddenColumns' in index.options) ||
            (index.options.hiddenColumns as any).indexOf(columnName) === -1
          ))
          .map(columnName => ({
            name: columnName,
            filters: {
              column: columnName
            }
          }))
      }

      // Check if there is a list of lanes in the view settings
      if (!('lanes' in viewSettings) || viewSettings.lanes.length === 0) {
        viewSettings.lanes = [{
          name: 'All tasks'
        }]
      }

      // If a root-level filter is defined, apply it to the tasks
      if ('filters' in viewSettings) {
        tasks = index.filterAndSortTasks(tasks, viewSettings.filters, [])
      }

      // Add columns
      board.headings = viewSettings.columns.map((column: any) => ({
        name: column.name,
        heading: getColumnHeading(index, column.name)
      }))

      // Add lanes and column contents
      board.lanes = []
      for (const lane of viewSettings.lanes) {
        const columns = []
        for (const column of viewSettings.columns) {
          const cellTasks = index.filterAndSortTasks(
            tasks,
            {
              ...('filters' in column ? column.filters : {}),
              ...('filters' in lane ? lane.filters : {})
            },
            'sorters' in column ? column.sorters : []
          )
          columns.push(cellTasks)
        }
        board.lanes.push({
          name: lane.name,
          columns
        })
      }

      if (json) {
        console.log(JSON.stringify(board, null, 2))
        return
      }

      // Prepare table
      const table = []
      table.push(board.headings.map((heading: any) => heading.heading))
      board.lanes.forEach((lane: any) => table.push(
        [lane.name],
        lane.columns.map((column: any) => column.map((task: Task) => getTaskString(index, task)).join(TASK_SEPARATOR))
      ))

      // Display as a table
      term.table(
        table,
        {
          hasBorder: true,
          contentHasMarkup: true,
          borderChars: 'lightRounded',
          borderAttr: { color: 'grey' },
          textAttr: { color: 'white', bgColor: 'default' },
          width: term.width,
          fit: true
        }
      )
    }