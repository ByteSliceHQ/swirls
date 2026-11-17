import { describe, expect, test } from 'bun:test'

import { decisionQuestionsSchema, validateDecisionResponse } from './decision'

const questions = decisionQuestionsSchema.parse({
  department: {
    type: 'choice',
    instructions: 'Team?',
    criteria: { billing: 'Billing', other: null },
  },
  severity: {
    type: 'score',
    instructions: 'Severity?',
    criteria: ['Low', 'Medium', 'High'],
  },
  urgent: { type: 'noul', instructions: 'Urgent?' },
})

const response = () => ({
  model: 'jev-1.13.0',
  usage: { input_tokens: 40, output_tokens: 0 },
  answers: {
    department: {
      type: 'choice' as const,
      choice: 'billing',
      probabilities: { billing: 0.8, other: 0.2 },
      confidence: 0.6,
    },
    severity: {
      type: 'score' as const,
      score: 1.5,
      legend: { '0': 'Low', '1': 'Medium', '2': 'High' },
      probabilities: { '0': 0.1, '1': 0.3, '2': 0.6 },
      confidence: 0.7,
    },
    urgent: { type: 'noul' as const, noul: 0.1 },
  },
})

describe('decision response contract', () => {
  test('structured score legends compare by JSON value rather than property order', () => {
    const scoreQuestions = decisionQuestionsSchema.parse({
      score: {
        type: 'score',
        instructions: 'Assess',
        criteria: [{ label: 'low', examples: ['a'] }, 'high'],
      },
    })

    const result = {
      model: 'jev-1.13.0',
      usage: { input_tokens: 10, output_tokens: 0 },
      answers: {
        score: {
          type: 'score' as const,
          score: 0.5,
          legend: { '0': { examples: ['a'], label: 'low' }, '1': 'high' },
          probabilities: { '0': 0.5, '1': 0.5 },
          confidence: 0,
        },
      },
    }

    expect(validateDecisionResponse(result, scoreQuestions)).toEqual(result)
  })

  test('preserves fractional score, independent confidence and the complete distributions', () => {
    expect(validateDecisionResponse(response(), questions)).toEqual(response())
  })

  test.each([
    (r: ReturnType<typeof response>) => {
      r.answers.department.choice = 'unknown'
    },
    (r: ReturnType<typeof response>) => {
      r.answers.department.choice = 'other'
    },
    (r: ReturnType<typeof response>) => {
      r.answers.department.probabilities.billing = 0.9
    },
    (r: ReturnType<typeof response>) => {
      r.answers.severity.score = 2
    },
    (r: ReturnType<typeof response>) => {
      r.answers.severity.legend['0'] = 'Wrong'
    },
    (r: ReturnType<typeof response>) => {
      r.answers.urgent.noul = Number.NaN
    },
    (r: ReturnType<typeof response>) => {
      r.answers.urgent.noul = Infinity
    },
    (r: ReturnType<typeof response>) => {
      r.usage.input_tokens = -1
    },
    (r: ReturnType<typeof response>) => {
      r.model = ''
    },
    (r: ReturnType<typeof response>) => {
      Reflect.deleteProperty(r.answers, 'urgent')
    },
    (r: ReturnType<typeof response>) => {
      Object.assign(r.answers, { extra: r.answers.urgent })
    },
    (r: ReturnType<typeof response>) => {
      Object.assign(r.answers.urgent, { confidence: 0.9 })
    },
    (r: ReturnType<typeof response>) => {
      Object.assign(r.answers.urgent, { type: 'score' })
    },
  ])('rejects malformed results', (change) => {
    const result = response()
    change(result)
    expect(() => validateDecisionResponse(result, questions)).toThrow()
  })

  test('both decisive no and decisive yes Noul results remain probabilities', () => {
    for (const p of [0, 1]) {
      const result = response()
      result.answers.urgent.noul = p

      expect(validateDecisionResponse(result, questions).answers.urgent).toEqual({
        type: 'noul',
        noul: p,
      })
    }
  })
})
