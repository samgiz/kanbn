const QUnit = require('qunit')
const mockFileSystem = require('mock-fs')
const kanbn = require('../../src/main')
const fixtures = require('../fixtures')

QUnit.module('sort tests', {
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

QUnit.test('Sort in uninitialised folder should throw "not initialised" error', async assert => {
  assert.throwsAsync(
    async () => {
      await kanbn.sort('column', {})
    },
    /Not initialised in this folder/
  )
})

QUnit.test('Sort non-existent column should throw "non-existent column" error', async assert => {
  fixtures({
    countTasks: 0,
    countColumns: 1
  })
  assert.throwsAsync(
    async () => {
      await kanbn.sort('Column 2', {})
    },
    /Column "Column 2" doesn't exist/
  )
})

QUnit.test('Sort on string field', async assert => {
  fixtures({
    noRandom: true,
    tasks: [
      {
        name: 'C task 2'
      },
      {
        name: 'A task 3'
      },
      {
        name: 'B task 1'
      }
    ],
    columns: {
      'Column 1': [
        'c-task-2',
        'a-task-3',
        'b-task-1'
      ]
    }
  })
  let index

  // Sort without filter or order (should default to ascending)
  await kanbn.sort('Column 1', [
    {
      field: 'id',
      filter: ''
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['a-task-3', 'b-task-1', 'c-task-2'])

  // Sanity check (ie. make sure deepEqual checks for element order)
  assert.notDeepEqual(index.columns['Column 1'], ['b-task-1', 'a-task-3', 'c-task-2'])

  // Sort without filter, descending order
  await kanbn.sort('Column 1', [
    {
      field: 'id',
      filter: '',
      order: 'descending'
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['c-task-2', 'b-task-1', 'a-task-3'])

  // Sort without filter, ascending order
  await kanbn.sort('Column 1', [
    {
      field: 'id',
      filter: '',
      order: 'ascending'
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['a-task-3', 'b-task-1', 'c-task-2'])

  // Sort with filter, ascending order
  await kanbn.sort('Column 1', [
    {
      field: 'id',
      filter: '[abc]-task-(\\d)',
      order: 'ascending'
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['b-task-1', 'c-task-2', 'a-task-3'])

  // Sort with filter, descending order
  await kanbn.sort('Column 1', [
    {
      field: 'id',
      filter: '[abc]-task-(\\d)',
      order: 'descending'
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['a-task-3', 'c-task-2', 'b-task-1'])

  // Add another task to the column, since we didn't save sorter settings the task should be appended to the end
  await kanbn.createTask({
    name: 'A task 1'
  }, 'Column 1')
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['a-task-3', 'c-task-2', 'b-task-1', 'a-task-1'])
})

QUnit.test('Sort on string field and save sorter settings', async assert => {
  fixtures({
    noRandom: true,
    tasks: [
      {
        name: 'C task 2'
      },
      {
        name: 'A task 3'
      },
      {
        name: 'B task 1'
      }
    ],
    columns: {
      'Column 1': [
        'c-task-2',
        'a-task-3',
        'b-task-1'
      ]
    }
  })
  let index

  // Sort without filter, ascending order
  await kanbn.sort('Column 1', [
    {
      field: 'id',
      filter: '',
      order: 'ascending'
    }
  ], true)
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['a-task-3', 'b-task-1', 'c-task-2'])

  // Add a task, since we saved sorter settings the task should automatically be sorted into the correct position
  await kanbn.createTask({
    name: 'A task 5'
  }, 'Column 1')
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['a-task-3', 'a-task-5', 'b-task-1', 'c-task-2'])

  // Sort with filter, ascending order
  await kanbn.sort('Column 1', [
    {
      field: 'id',
      filter: '[abc]-task-(\\d)',
      order: 'ascending'
    }
  ], true)
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['b-task-1', 'c-task-2', 'a-task-3', 'a-task-5'])

  // Add a task, since we saved sorter settings the task should automatically be sorted into the correct position
  await kanbn.createTask({
    name: 'B task 4'
  }, 'Column 1')
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['b-task-1', 'c-task-2', 'a-task-3', 'b-task-4', 'a-task-5'])
})

QUnit.test('Sort on numeric field', async assert => {
  fixtures({
    noRandom: true,
    tasks: [
      {
        name: 'Task 1',
        metadata: {
          tags: ['a', 'b', 'c']
        }
      },
      {
        name: 'Task 2'
      },
      {
        name: 'Task 3',
        metadata: {
          tags: ['a', 'b']
        }
      }
    ],
    columns: {
      'Column 1': [
        'task-1',
        'task-2',
        'task-3'
      ]
    }
  })
  let index

  // Sort using default order (should be ascending)
  await kanbn.sort('Column 1', [
    {
      field: 'countTags'
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['task-2', 'task-3', 'task-1'])

  // Sort using descending order
  await kanbn.sort('Column 1', [
    {
      field: 'countTags',
      order: 'descending'
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['task-1', 'task-3', 'task-2'])
})

QUnit.test('Sort on date field', async assert => {
  fixtures({
    noRandom: true,
    tasks: [
      {
        name: 'Task 1',
        metadata: {
          due: new Date('01 January 2020 00:00:00 GMT')
        }
      },
      {
        name: 'Task 2'
      },
      {
        name: 'Task 3',
        metadata: {
          due: new Date('02 January 2020 00:00:00 GMT')
        }
      }
    ],
    columns: {
      'Column 1': [
        'task-1',
        'task-2',
        'task-3'
      ]
    }
  })
  let index

  // Sort using default order (should be ascending)
  await kanbn.sort('Column 1', [
    {
      field: 'due'
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['task-2', 'task-1', 'task-3'])

  // Sort using descending order
  await kanbn.sort('Column 1', [
    {
      field: 'due',
      order: 'descending'
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['task-3', 'task-1', 'task-2'])
})

QUnit.test('Sort on custom field', async assert => {
  fixtures({
    noRandom: true,
    tasks: [
      {
        name: 'Task 1',
        metadata: {
          testField: 2
        }
      },
      {
        name: 'Task 2'
      },
      {
        name: 'Task 3',
        metadata: {
          testField: 1
        }
      }
    ],
    columns: {
      'Column 1': [
        'task-1',
        'task-2',
        'task-3'
      ]
    },
    options: {
      customFields: [
        {
          name: 'testField',
          type: 'number'
        }
      ]
    }
  })
  let index

  // Sort using default order (should be ascending)
  await kanbn.sort('Column 1', [
    {
      field: 'testField'
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['task-2', 'task-3', 'task-1'])

  // Sort using descending order
  await kanbn.sort('Column 1', [
    {
      field: 'testField',
      order: 'descending'
    }
  ])
  index = await kanbn.getIndex()
  assert.deepEqual(index.columns['Column 1'], ['task-1', 'task-3', 'task-2'])
})
