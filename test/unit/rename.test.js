const QUnit = require('qunit')
const mockFileSystem = require('mock-fs')
const kanbn = require('../../src/main')
const context = require('../context')

QUnit.module('renameTask tests', {
  before () {
    require('../qunit-throws-async')
  },
  beforeEach () {
    require('../fixtures')({
      countColumns: 1,
      countTasks: 2
    })
  },
  afterEach () {
    mockFileSystem.restore()
  }
})

QUnit.test('Rename task in uninitialised folder should throw "not initialised" error', async assert => {
  mockFileSystem()
  assert.throwsAsync(
    async () => {
      await kanbn.renameTask('task-1', 'task-3')
    },
    /Not initialised in this folder/
  )
})

QUnit.test('Rename non-existent task should throw "task file not found" error', async assert => {
  assert.throwsAsync(
    async () => {
      await kanbn.renameTask('task-3', 'task-4')
    },
    /No task file found with id "task-3"/
  )
})

QUnit.test('Rename an untracked task should throw "task not indexed" error', async assert => {
  // Create a mock index and untracked task
  mockFileSystem({
    '.kanbn': {
      'index.md': '# Test Project\n\n## Test Column 1',
      tasks: {
        'test-task.md': '# Test Task'
      }
    }
  })

  // Try to move an untracked task
  assert.throwsAsync(
    async () => {
      await kanbn.renameTask('test-task', 'test-task-2')
    },
    /Task "test-task" is not in the index/
  )
})

QUnit.test('Rename a task to a name that already exists should throw "task already exists" error', async assert => {
  assert.throwsAsync(
    async () => {
      await kanbn.renameTask('task-1', 'task-2')
    },
    /A task with id "task-2" already exists/
  )
})

QUnit.test('Rename a task', async assert => {
  const BASE_PATH = await kanbn.getMainFolder()
  const currentDate = (new Date()).toISOString()
  await kanbn.renameTask('task-1', 'task-3')

  // Verify that the task was renamed
  context.indexHasTask(assert, BASE_PATH, 'task-3')
  context.indexHasTask(assert, BASE_PATH, 'task-1', null, false)

  // Verify that the file was renamed
  context.taskFileExists(assert, BASE_PATH, 'task-3')
  context.taskFileExists(assert, BASE_PATH, 'task-1', false)

  // Verify that the task updated date was updated
  const task = await kanbn.getTask('task-3')
  assert.equal(task.metadata.updated.toISOString().substr(0, 9), currentDate.substr(0, 9))
})
