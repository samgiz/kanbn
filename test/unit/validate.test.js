const QUnit = require('qunit')
const mockFileSystem = require('mock-fs')
const fs = require('fs')
const path = require('path')
const kanbn = require('../../src/main')

QUnit.module('validate tests', {
  before () {
    require('../qunit-throws-async')
  },
  beforeEach () {
    require('../fixtures')({
      countTasks: 3
    })
  },
  afterEach () {
    mockFileSystem.restore()
  }
})

QUnit.test('Validate uninitialised folder should throw "not initialised" error', async assert => {
  mockFileSystem()
  assert.throwsAsync(
    async () => {
      await kanbn.validate()
    },
    /Not initialised in this folder/
  )
})

QUnit.test('Validate valid index and tasks should return true', async assert => {
  // Validate with re-save, then validate again
  assert.equal(await kanbn.validate(true), true)
  assert.equal(await kanbn.validate(), true)
})

QUnit.test(
  'Validate with problems in index should return single-element array containing index error',
  async assert => {
    // Re-write an invalid index file
    await fs.promises.writeFile(
      path.join(process.cwd(), '.kanbn/index.md'),
      '#'
    )

    // Validate
    assert.deepEqual(await kanbn.validate(), [
      {
        task: null,
        errors: 'Unable to parse index: data is missing a name heading'
      }
    ])
  }
)

QUnit.test('Validate with problems in task files should return array of task errors', async assert => {
  // Re-write invalid task files
  await fs.promises.writeFile(
    path.join(process.cwd(), '.kanbn/tasks/task-1.md'),
    ''
  )
  await fs.promises.writeFile(
    path.join(process.cwd(), '.kanbn/tasks/task-2.md'),
    'test'
  )
  await fs.promises.writeFile(
    path.join(process.cwd(), '.kanbn/tasks/task-3.md'),
    '# Name\n\n## Metadata\n\ntest'
  )

  // Validate
  assert.deepEqual((await kanbn.validate()).sort((a, b) => a.task.localeCompare(b.task)), [
    {
      task: 'task-1',
      errors: 'Unable to parse task: data is null or empty'
    },
    {
      task: 'task-2',
      errors: 'Unable to parse task: data is missing a name heading'
    },
    {
      task: 'task-3',
      errors: 'Unable to parse task: invalid metadata content'
    }
  ])
})
