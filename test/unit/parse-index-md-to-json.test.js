const QUnit = require('qunit')
const parseIndex = require('../../src/parse-index')

QUnit.module('Index markdown to JSON conversion tests')

const TEST_NAME = 'Test Name'
const TEST_DESCRIPTION = 'Test description...'
const TEST_COLUMN_1 = 'Column 1'
const TEST_COLUMN_2 = 'Column 2'
const TEST_TASK_1 = 'Task-1'
const TEST_TASK_2 = 'Task-2'

const invalidCases = [
  {
    md: null,
    error: /data is null or empty/
  },
  {
    md: '',
    error: /data is null or empty/
  },
  {
    md: 1,
    error: /data is not a string/
  },
  {
    md: '#',
    error: /data is missing a name heading/
  },
  {
    md: 'test',
    error: /data is missing a name heading/
  },
  {
    md: `
# ${TEST_NAME}

${TEST_DESCRIPTION}

## Options

Invalid options
`,
    error: /invalid options content/
  },
  {
    md: `
# ${TEST_NAME}

## ${TEST_COLUMN_1}

Invalid column contents
`,
    error: new RegExp(`column "${TEST_COLUMN_1}" must contain a list`)
  },
  {
    md: `---
Invalid Options
---

# ${TEST_NAME}
`,
    error: /invalid front matter content/
  },
  {
    md: `---
test: 1
---

# ${TEST_NAME}

## Options

Invalid options
`,
    error: /invalid options content/
  }
]

const validCases = [
  {
    md: `
# ${TEST_NAME}
`,
    json: {
      name: TEST_NAME,
      description: '',
      options: {},
      columns: {}
    }
  },
  {
    md: `
# ${TEST_NAME}

${TEST_DESCRIPTION}
`,
    json: {
      name: TEST_NAME,
      description: TEST_DESCRIPTION,
      options: {},
      columns: {}
    }
  },
  {
    md: `
# ${TEST_NAME}

${TEST_DESCRIPTION}

## Options

\`\`\`
validOptions: test
\`\`\`
`,
    json: {
      name: TEST_NAME,
      description: TEST_DESCRIPTION,
      options: {
        validOptions: 'test'
      },
      columns: {}
    }
  },
  {
    md: `
# ${TEST_NAME}

## Options

\`\`\`yaml
validOptions: test
\`\`\`
`,
    json: {
      name: TEST_NAME,
      description: '',
      options: {
        validOptions: 'test'
      },
      columns: {}
    }
  },
  {
    md: `
# ${TEST_NAME}

${TEST_DESCRIPTION}

## Options

validOptions: test
`,
    json: {
      name: TEST_NAME,
      description: TEST_DESCRIPTION,
      options: {
        validOptions: 'test'
      },
      columns: {}
    }
  },
  {
    md: `
# ${TEST_NAME}

## ${TEST_COLUMN_1}
`,
    json: {
      name: TEST_NAME,
      description: '',
      options: {},
      columns: {
        [TEST_COLUMN_1]: []
      }
    }
  },
  {
    md: `
# ${TEST_NAME}

${TEST_DESCRIPTION}

## ${TEST_COLUMN_1}
- ${TEST_TASK_1}
- ${TEST_TASK_2}
`,
    json: {
      name: TEST_NAME,
      description: TEST_DESCRIPTION,
      options: {},
      columns: {
        [TEST_COLUMN_1]: [
          TEST_TASK_1,
          TEST_TASK_2
        ]
      }
    }
  },
  {
    md: `
# ${TEST_NAME}

${TEST_DESCRIPTION}

## ${TEST_COLUMN_1}
- [${TEST_TASK_1}](${TEST_TASK_1}.md)
- [${TEST_TASK_2}](${TEST_TASK_2}.md)

## ${TEST_COLUMN_2}
- [${TEST_TASK_1}](${TEST_TASK_1}.md)
- ${TEST_TASK_2}
`,
    json: {
      name: TEST_NAME,
      description: TEST_DESCRIPTION,
      options: {},
      columns: {
        [TEST_COLUMN_1]: [
          TEST_TASK_1,
          TEST_TASK_2
        ],
        [TEST_COLUMN_2]: [
          TEST_TASK_1,
          TEST_TASK_2
        ]
      }
    }
  },
  {
    md: `---
validOptions: test
---

# ${TEST_NAME}

${TEST_DESCRIPTION}

## ${TEST_COLUMN_1}
- [${TEST_TASK_1}](${TEST_TASK_1}.md)
- [${TEST_TASK_2}](${TEST_TASK_2}.md)
`,
    json: {
      name: TEST_NAME,
      description: TEST_DESCRIPTION,
      options: {
        validOptions: 'test'
      },
      columns: {
        [TEST_COLUMN_1]: [
          TEST_TASK_1,
          TEST_TASK_2
        ]
      }
    }
  },
  {
    md: `---
validOption: test1
---

# ${TEST_NAME}

${TEST_DESCRIPTION}

## Options
\`\`\`
validOption: test2
anotherValidOption: test3
\`\`\`

## ${TEST_COLUMN_1}
- [${TEST_TASK_1}](${TEST_TASK_1}.md)
- [${TEST_TASK_2}](${TEST_TASK_2}.md)
`,
    json: {
      name: TEST_NAME,
      description: TEST_DESCRIPTION,
      options: {
        validOption: 'test2',
        anotherValidOption: 'test3'
      },
      columns: {
        [TEST_COLUMN_1]: [
          TEST_TASK_1,
          TEST_TASK_2
        ]
      }
    }
  }
]

QUnit.test('Test index to json conversion with valid markdown', assert => {
  validCases.forEach((validCase, i) => {
    assert.deepEqual(parseIndex.md2json(validCase.md), validCase.json, `Failed on valid case ${i + 1}`)
  })
})

QUnit.test('Test index to json conversion with invalid markdown', assert => {
  invalidCases.forEach((invalidCase, i) => {
    assert.throws(() => { parseIndex.md2json(invalidCase.md) }, invalidCase.error, `Failed on invalid case ${i + 1}`)
  })
})
