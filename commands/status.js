const kanbn = require('../lib/main');
const utility = require('../lib/utility');
const Spinner = require('cli-spinner').Spinner;
const chrono = require('chrono-node');

module.exports = async args => {

  // Make sure kanbn has been initialised
  if (!await kanbn.initialised()) {
    console.error(utility.replaceTags('Kanbn has not been initialised in this folder\nTry running: {b}kanbn init{b}'));
    return;
  }

  // Get sprint number or name
  let sprint = null;
  if (args.sprint) {
    sprint = utility.argToString(args.sprint);
    const sprintNumber = parseInt(sprint);
    if (!isNaN(sprintNumber)) {
      sprint = sprintNumber;
    }
  }

  // Re-use the description arg for dates
  let dates = [...args.date || [], ...args.description || []].flat();
  if (dates.length) {
    for (let i = 0; i < dates.length; i++) {
      const dateValue = chrono.parseDate(dates[i]);
      if (dateValue === null) {
        console.error('Unable to parse date');
        return;
      }
      dates[i] = dateValue;
    }
  } else {
    dates = null;
  }

  // Get status
  const spinner = new Spinner('Getting status information...');
  spinner.setSpinnerString(18);
  spinner.start();
  kanbn
  .status(
    args.quiet,
    args.json,
    args.untracked,
    sprint,
    dates
  )
  .then(output => {
    spinner.stop(true);
    console.log(output);
  })
  .catch(error => {
    spinner.stop(true);
    utility.showError(error);
  });
};
