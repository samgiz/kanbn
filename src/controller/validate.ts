const yaml = require('yamljs')
import {Kanbn} from '../model/Kanbn'
import * as utility from '../utility'

module.exports = async (args: any) => {
  const kanbn = new Kanbn()
  // Make sure kanbn has been initialised
  if (!await kanbn.initialised()) {
    utility.error('Kanbn has not been initialised in this folder\nTry running: {b}kanbn init{b}')
    return
  }

  // Validate kanbn files
  kanbn.validate(args.save)
    .then((result: any) => {
      if (result === true) {
        console.log('Everything OK')
      } else {
        utility.error(
        `${result.length} errors found in task files:\n${(
          args.json
            ? JSON.stringify(result, null, 2)
            : yaml.stringify(result, 4, 2)
        )}`
        )
      }
    })
    .catch((error: Error) => {
      utility.error(error)
    })
}
