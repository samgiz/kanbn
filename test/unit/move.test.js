const QUnit = require('qunit')
const mockFileSystem = require('mock-fs')
const kanbn = require('../../src/main')
const context = require('../context')
const mockDate = require('mockdate')

QUnit.module('moveTask tests', {
  before () {
    require('../qunit-throws-async')
  },
  beforeEach () {
    require('../fixtures')({
      countColumns: 4,
      countTasks: 17,
      tasksPerColumn: 5,
      options: {
        startedColumns: ['Column 2'],
        completedColumns: ['Column 3']
      }
    })
  },
  afterEach () {
    mockFileSystem.restore()
  }
})

QUnit.test('Move task in uninitialised folder should throw "not initialised" error', async assert => {
  mockFileSystem()
  assert.throwsAsync(
    async () => {
      await kanbn.moveTask('task-1', 'Column 2')
    },
    /Not initialised in this folder/
  )
})

QUnit.test('Move non-existent task should throw "task file not found" error', async assert => {
  assert.throwsAsync(
    async () => {
      await kanbn.moveTask('task-18', 'Column 2')
    },
    /No task file found with id "task-18"/
  )
})

QUnit.test('Move an untracked task should throw "task not indexed" error', async assert => {
  // Create a mock index with an untracked task
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
      await kanbn.moveTask('test-task', 'Test Column 1')
    },
    /Task "test-task" is not in the index/
  )
})

QUnit.test('Move a task to a non-existent column should throw "column not found" error', async assert => {
  assert.throwsAsync(
    async () => {
      await kanbn.moveTask('task-1', 'Column 5')
    },
    /Column "Column 5" doesn't exist/
  )
})

QUnit.test('Move a task', async assert => {
  const BASE_PATH = await kanbn.getMainFolder()
  const currentDate = (new Date()).toISOString()
  await kanbn.moveTask('task-1', 'Column 2')

  // Verify that the task was moved
  context.indexHasTask(assert, BASE_PATH, 'task-1', 'Column 2')
  context.indexHasTask(assert, BASE_PATH, 'task-1', 'Column 1', false)

  // Verify that the task updated date was updated
  const task = await kanbn.getTask('task-1')
  assert.equal(task.metadata.updated.toISOString().substr(0, 9), currentDate.substr(0, 9))
})

QUnit.test('Move a task into a started column should update the started date', async assert => {
  const BASE_PATH = await kanbn.getMainFolder()
  const currentDate = (new Date()).toISOString()
  await kanbn.moveTask('task-1', 'Column 2')

  // Verify that the task was moved
  context.indexHasTask(assert, BASE_PATH, 'task-1', 'Column 2')
  context.indexHasTask(assert, BASE_PATH, 'task-1', 'Column 1', false)

  // Verify that the task started date was updated
  const task = await kanbn.getTask('task-1')
  assert.equal(task.metadata.started.toISOString().substr(0, 9), currentDate.substr(0, 9))
})

QUnit.test('Move a task into a completed column should update the completed date', async assert => {
  const BASE_PATH = await kanbn.getMainFolder()
  const currentDate = (new Date()).toISOString()
  await kanbn.moveTask('task-1', 'Column 3')

  // Verify that the task was moved
  context.indexHasTask(assert, BASE_PATH, 'task-1', 'Column 3')
  context.indexHasTask(assert, BASE_PATH, 'task-1', 'Column 1', false)

  // Verify that the task completed date was updated
  const task = await kanbn.getTask('task-1')
  assert.equal(task.metadata.completed.toISOString().substr(0, 9), currentDate.substr(0, 9))
})

QUnit.test('Move a task into a custom metadata-linked column (update date once)', async assert => {
  const BASE_PATH = await kanbn.getMainFolder()
  const TEST_DATE_1 = '2000-01-01T00:00:00.000Z'
  const TEST_DATE_2 = '2000-01-02T00:00:00.000Z'

  require('../fixtures')({
    countColumns: 3,
    countTasks: 1,
    options: {
      testColumns: [
        'Column 2',
        'Column 3'
      ],
      customFields: [
        {
          name: 'test',
          type: 'date',
          updateDate: 'once'
        }
      ]
    }
  })

  // Move task
  mockDate.set(TEST_DATE_1)
  await kanbn.moveTask('task-1', 'Column 2')

  // Verify that the task was moved
  context.indexHasTask(assert, BASE_PATH, 'task-1', 'Column 2')
  context.indexHasTask(assert, BASE_PATH, 'task-1', 'Column 1', false)

  // Verify that the task's metadata property was updated
  let task = await kanbn.getTask('task-1')
  assert.equal(task.metadata.test.toISOString(), TEST_DATE_1)

  // Move the task again
  mockDate.set(TEST_DATE_2)
  await kanbn.moveTask('task-1', 'Column 3')

  // Verify that the task's metadata property was not updated again
  task = await kanbn.getTask('task-1')
  assert.equal(task.metadata.test.toISOString(), TEST_DATE_1)
})

QUnit.test('Move a task into a custom metadata-linked column (update date always)', async assert => {
  const BASE_PATH = await kanbn.getMainFolder()
  const TEST_DATE_1 = '2000-01-01T00:00:00.000Z'
  const TEST_DATE_2 = '2000-01-02T00:00:00.000Z'

  require('../fixtures')({
    countColumns: 3,
    countTasks: 1,
    options: {
      testColumns: [
        'Column 2',
        'Column 3'
      ],
      customFields: [
        {
          name: 'test',
          type: 'date',
          updateDate: 'always'
        }
      ]
    }
  })

  // Move task
  mockDate.set(TEST_DATE_1)
  await kanbn.moveTask('task-1', 'Column 2')

  // Verify that the task was moved
  context.indexHasTask(assert, BASE_PATH, 'task-1', 'Column 2')
  context.indexHasTask(assert, BASE_PATH, 'task-1', 'Column 1', false)

  // Verify that the task's metadata property was updated
  let task = await kanbn.getTask('task-1')
  assert.equal(task.metadata.test.toISOString(), TEST_DATE_1)

  // Move the task again
  mockDate.set(TEST_DATE_2)
  await kanbn.moveTask('task-1', 'Column 3')

  // Verify that the task's metadata property was not updated again
  task = await kanbn.getTask('task-1')
  assert.equal(task.metadata.test.toISOString(), TEST_DATE_2)
})

QUnit.test('Move a task to an absolute position in the same column', async assert => {
  const BASE_PATH = await kanbn.getMainFolder()

  await kanbn.moveTask('task-1', 'Column 1', -1)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 0)

  await kanbn.moveTask('task-1', 'Column 1', 0)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 0)

  await kanbn.moveTask('task-1', 'Column 1', 1)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 1)

  await kanbn.moveTask('task-1', 'Column 1', 2)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 2)

  await kanbn.moveTask('task-1', 'Column 1', 3)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 3)

  await kanbn.moveTask('task-1', 'Column 1', 4)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 4)

  await kanbn.moveTask('task-1', 'Column 1', 5)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 4)

  await kanbn.moveTask('task-1', 'Column 1', 0)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 0)

  await kanbn.moveTask('task-1', 'Column 1', 4)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 4)

  await kanbn.moveTask('task-1', 'Column 1', 1)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 1)

  await kanbn.moveTask('task-1', 'Column 1', 3)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 3)
})

QUnit.test('Move a task to an absolute position in another column', async assert => {
  const BASE_PATH = await kanbn.getMainFolder()

  await kanbn.moveTask('task-1', 'Column 2', -1)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 2', 0)

  await kanbn.moveTask('task-1', 'Column 3', 0)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 3', 0)

  await kanbn.moveTask('task-1', 'Column 2', 1)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 2', 1)

  await kanbn.moveTask('task-1', 'Column 3', 2)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 3', 2)

  await kanbn.moveTask('task-1', 'Column 2', 3)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 2', 3)

  await kanbn.moveTask('task-1', 'Column 3', 4)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 3', 4)

  await kanbn.moveTask('task-1', 'Column 2', 5)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 2', 5)

  await kanbn.moveTask('task-1', 'Column 3', 6)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 3', 5)
})

QUnit.test('Move a task to a relative position in the same column', async assert => {
  const BASE_PATH = await kanbn.getMainFolder()

  await kanbn.moveTask('task-1', 'Column 1', -1, true)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 0)

  await kanbn.moveTask('task-1', 'Column 1', 2, true)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 2)

  await kanbn.moveTask('task-1', 'Column 1', -1, true)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 1)

  await kanbn.moveTask('task-1', 'Column 1', -10, true)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 0)

  await kanbn.moveTask('task-1', 'Column 1', 10, true)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 1', 4)
})

QUnit.test('Move a task to a relative position in another column', async assert => {
  const BASE_PATH = await kanbn.getMainFolder()

  await kanbn.moveTask('task-1', 'Column 2', 1, true)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 2', 1)

  await kanbn.moveTask('task-1', 'Column 3', 2, true)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 3', 3)

  await kanbn.moveTask('task-1', 'Column 2', -1, true)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 2', 2)

  await kanbn.moveTask('task-1', 'Column 3', -10, true)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 3', 0)

  await kanbn.moveTask('task-1', 'Column 2', 10, true)
  context.taskHasPositionInColumn(assert, BASE_PATH, 'task-1', 'Column 2', 5)
})
