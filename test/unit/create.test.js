const QUnit = require('qunit')
const mockFileSystem = require('mock-fs')
const fs = require('fs')
const path = require('path')
const kanbn = require('../../src/main')
const context = require('../context')

QUnit.module('createTask tests', {
  before () {
    require('../qunit-throws-async')
  },
  beforeEach () {
    mockFileSystem()
  },
  afterEach () {
    mockFileSystem.restore()
  }
})

QUnit.test('Create task in uninitialised folder should throw "not initialised" error', async assert => {
  assert.throwsAsync(
    async () => {
      await kanbn.createTask({ name: 'Test name' }, 'Backlog')
    },
    /Not initialised in this folder/
  )
})

QUnit.test('Create task with no options or blank name should throw "blank name" error', async assert => {
  await kanbn.initialise()

  // Create a task with no options
  assert.throwsAsync(
    async () => {
      await kanbn.createTask({}, 'Backlog')
    },
    /Task name cannot be blank/
  )

  // Create a task with an empty name
  assert.throwsAsync(
    async () => {
      await kanbn.createTask({ name: '' }, 'Backlog')
    },
    /Task name cannot be blank/
  )
})

QUnit.test('Create task in non-existent column should throw "column not found" error', async assert => {
  const NON_EXISTENT_COLUMN = 'Wibble'
  await kanbn.initialise()
  assert.throwsAsync(
    async () => {
      await kanbn.createTask({ name: 'Test name' }, NON_EXISTENT_COLUMN)
    },
    new RegExp(`Column "${NON_EXISTENT_COLUMN}" doesn't exist`)
  )
})

QUnit.test(
  'Create task with id that already exists as an untracked task should throw "task already exists" error',
  async assert => {
    const TASK_ID = 'test-name'
    const TASK_NAME = 'Test name'
    await kanbn.initialise()

    // Create a task file without adding it to the index
    await fs.promises.writeFile(
      path.join(process.cwd(), `.kanbn/tasks/${TASK_ID}.md`),
      'Hello, world!'
    )

    // Try to create a task with a duplicate filename
    assert.throwsAsync(
      async () => {
        await kanbn.createTask({ name: TASK_NAME }, 'Backlog')
      },
      new RegExp(`A task with id "${TASK_ID}" already exists`)
    )
  }
)

QUnit.test(
  'Create task with id that already exists in the index should throw "task already indexed" error',
  async assert => {
    const TASK_ID = 'test-name'
    const TASK_NAME = 'Test name'
    await kanbn.initialise()

    // Re-write the index file to contain the task without creating a file
    await fs.promises.writeFile(
      path.join(process.cwd(), '.kanbn/index.md'),
      `# Project title\n\n## Backlog\n\n- [${TASK_ID}](tasks\\${TASK_ID}.md)`
    )

    // Try to create a task with a duplicate index entry
    assert.throwsAsync(
      async () => {
        await kanbn.createTask({ name: TASK_NAME }, 'Backlog')
      },
      new RegExp(`A task with id "${TASK_ID}" is already in the index`)
    )
  }
)

QUnit.test('Create task', async assert => {
  await kanbn.initialise()
  const TASK_ID = await kanbn.createTask({ name: 'Test name' }, 'Backlog')

  // Verify that the file exists and is indexed
  const BASE_PATH = await kanbn.getMainFolder()
  context.taskFileExists(assert, BASE_PATH, TASK_ID)
  context.indexHasTask(assert, BASE_PATH, TASK_ID, 'Backlog')
})

QUnit.test('Create task in a started column should update the started date', async assert => {
  await kanbn.initialise()
  const TASK_ID = await kanbn.createTask({ name: 'Test name' }, 'In Progress')

  // Verify that the task has a started date that matches the created date
  const task = await kanbn.getTask(TASK_ID)
  assert.equal(task.metadata.started.toISOString(), task.metadata.created.toISOString())
})

QUnit.test('Create task in a completed column should update the completed date', async assert => {
  await kanbn.initialise()
  const TASK_ID = await kanbn.createTask({ name: 'Test name' }, 'Done')

  // Verify that the task has a completed date that matches the created date
  const task = await kanbn.getTask(TASK_ID)
  assert.equal(task.metadata.completed.toISOString(), task.metadata.created.toISOString())
})
