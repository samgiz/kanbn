import {Kanbn} from '../model/Kanbn'
import * as utility from '../utility'
import * as parseTask from '../parse-task'
const marked = require('marked')
const MarkedTerminalRenderer = require('marked-terminal')

/**
 * Show task information
 * @param {string} taskId
 */
function showTask (taskId: string, json = false) {
  new Kanbn()
    .getTask(taskId)
    .then((task) => {
      if (json) {
        console.log(task)
      } else {
        marked.setOptions({
          renderer: new MarkedTerminalRenderer()
        })
        console.log(marked(parseTask.json2md(task)))
      }
    })
    .catch((error) => {
      utility.error(error)
    })
}

module.exports = async (args: any) => {
  // Make sure kanbn has been initialised
  if (!(await new Kanbn().initialised())) {
    utility.error('Kanbn has not been initialised in this folder\nTry running: {b}kanbn init{b}')
    return
  }

  // Get the task that we're showing
  const taskId = args._[1]
  if (!taskId) {
    utility.error('No task id specified\nTry running {b}kanbn task "task id"{b}')
    return
  }

  // Make sure the task exists
  try {
    await new Kanbn().taskExists(taskId)
  } catch (error: any) {
    utility.error(error)
    return
  }

  // Show the task
  showTask(taskId, args.json)
}
