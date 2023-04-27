import { Kanbn } from '../model/Kanbn'
import * as utility from '../utility'
const inquirer = require('inquirer')
const kanbn = new Kanbn()

/**
 * Start a new sprint interactively
 * @param {?string} [name=null] The sprint name
 * @param {?string} [description=null] The sprint description
 * @return {Promise<any>}
 */
async function interactive (name: string | null = null, description: string | null = null) {
  return await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Sprint name:',
      default: name || '',
      validate: async value => {
        if (!value) {
          return 'Sprint name cannot be empty'
        }
        return true
      }
    },
    {
      type: 'confirm',
      name: 'setDescription',
      message: 'Add a description?',
      default: false
    },
    {
      type: 'editor',
      name: 'description',
      message: 'Sprint description:',
      default: description || '',
      when: answers => answers.setDescription
    }
  ])
}

/**
 * Start a new sprint
 * @param {string} name
 * @param {string} description
 */
function startSprint (name, description) {
  kanbn
    .sprint(name, description, new Date())
    .then(sprint => {
      console.log(`Started new sprint "${sprint.name}" at ${sprint.start.toISOString()}`)
    })
    .catch(error => {
      utility.error(error)
    })
}

module.exports = async args => {
  // Make sure kanbn has been initialised
  if (!await kanbn.initialised()) {
    utility.error('Kanbn has not been initialised in this folder\nTry running: {b}kanbn init{b}')
    return
  }

  // Get sprint settings from arguments
  // Name
  let name = ''
  if (args.name) {
    name = utility.strArg(args.name)
  }

  // Description
  let description = ''
  if (args.description) {
    description = utility.strArg(args.description)
  }

  // Start sprint interactively
  if (args.interactive) {
    interactive(name, description)
      .then(answers => {
        startSprint(answers.name, answers.description || '')
      })
      .catch(error => {
        utility.error(error)
      })

  // Otherwise start sprint non-interactively
  } else {
    startSprint(name, description)
  }
}
