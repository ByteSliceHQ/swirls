import { z } from 'zod'

/** JSON only: executable values and undefined never enter a provider request. */
const structuredText = z.union([
  z.string().min(1),
  z.record(z.string(), z.json()),
  z.array(z.json()),
])
const identifier = z.string().regex(/^[a-zA-Z0-9_]+$/)
const questionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('choice'),
      instructions: structuredText,
      criteria: z
        .record(identifier, structuredText.nullable())
        .refine(
          (v) => Object.keys(v).length >= 1 && Object.keys(v).length <= 255,
          'Choice requires 1–255 options',
        ),
    })
    .strict(),
  z
    .object({
      type: z.literal('score'),
      instructions: structuredText,
      criteria: z.array(structuredText.nullable()).min(2).max(10),
    })
    .strict(),
  z
    .object({
      type: z.literal('noul'),
      instructions: structuredText,
      criteria: z
        .object({
          true: structuredText.nullable().optional(),
          false: structuredText.nullable().optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
])
export const decisionQuestionsSchema = z
  .record(identifier, questionSchema)
  .refine((v) => Object.keys(v).length > 0, 'At least one question is required')
export type DecisionQuestions = z.infer<typeof decisionQuestionsSchema>

export const decisionDefinitionSchema = z
  .object({
    name: identifier,
    label: z.string().optional(),
    description: z.string().optional(),
    provider: z.literal('typesafe'),
    model: z.string().trim().min(1),
    secrets: identifier,
    inputSchema: z.record(z.string(), z.unknown()),
    questions: decisionQuestionsSchema,
  })
  .strict()
export type DecisionDefinition = z.infer<typeof decisionDefinitionSchema>

export const decisionNodeConfigSchema = z
  .object({
    type: z.literal('decision'),
    // Validated by the shared workflow failure-policy intersection.
    failurePolicy: z.unknown().optional(),
    decision: identifier,
    state: z.union([
      z.string(),
      z.record(z.string(), z.json()),
      z.array(z.json()),
    ]),
    model: z.string().optional(),
    /** Immutable declaration copied into the deployed node. */
    definition: decisionDefinitionSchema.optional(),
  })
  .strict()
export type DecisionNodeConfig = z.infer<typeof decisionNodeConfigSchema>

const probability = z.number().min(0).max(1)
const distribution = z.record(z.string(), probability)
const answerSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('choice'),
      choice: z.string(),
      probabilities: distribution,
      confidence: probability,
    })
    .strict(),
  z
    .object({
      type: z.literal('score'),
      score: z.number(),
      legend: z.record(z.string(), structuredText.nullable()),
      probabilities: distribution,
      confidence: probability,
    })
    .strict(),
  z.object({ type: z.literal('noul'), noul: probability }).strict(),
])
export const decisionResponseSchema = z.object({
  model: z.string().trim().min(1),
  answers: z.record(z.string(), answerSchema),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .strict(),
})
export type DecisionResponse = z.infer<typeof decisionResponseSchema>

const sameKeys = (a: object, b: object) => {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => Object.hasOwn(b, k))
  )
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameJson(item, b[i]))
  }
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    return (
      sameKeys(a, b) &&
      Object.entries(a).every(([key, value]) =>
        sameJson(value, (b as Record<string, unknown>)[key]),
      )
    )
  }
  return false
}

/** Do not include provider values in validation errors: state may be sensitive. */
export function validateDecisionResponse(
  value: unknown,
  questions: DecisionQuestions,
): DecisionResponse {
  const parsed = decisionResponseSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error('Malformed TypeSafe response envelope')
  }
  const result = parsed.data
  if (!sameKeys(result.answers, questions)) {
    throw new Error('TypeSafe answer IDs do not match the questions')
  }
  for (const [id, question] of Object.entries(questions)) {
    const answer = result.answers[id]!
    if (answer.type !== question.type) {
      throw new Error(`TypeSafe answer type mismatch for ${id}`)
    }
    if (answer.type === 'noul' || question.type === 'noul') {
      continue
    }
    const domain =
      question.type === 'choice'
        ? question.criteria
        : Object.fromEntries(question.criteria.map((v, i) => [String(i), v]))
    const probabilities = answer.probabilities
    if (
      !sameKeys(probabilities, domain) ||
      Math.abs(Object.values(probabilities).reduce((a, b) => a + b, 0) - 1) >
        1e-6
    ) {
      throw new Error(`Invalid TypeSafe distribution for ${id}`)
    }
    if (
      answer.type === 'choice' &&
      (!Object.hasOwn(domain, answer.choice) ||
        probabilities[answer.choice]! <
          Math.max(...Object.values(probabilities)) - 1e-6)
    ) {
      throw new Error(`Invalid TypeSafe choice for ${id}`)
    }
    if (answer.type === 'score') {
      const expected = Object.entries(probabilities).reduce(
        (sum, [k, p]) => sum + Number(k) * p,
        0,
      )
      if (
        !sameJson(answer.legend, domain) ||
        Math.abs(answer.score - expected) > 1e-6
      ) {
        throw new Error(`Invalid TypeSafe score for ${id}`)
      }
    }
  }
  return result
}

/** Shared by deployment snapshots and editor context typing. */
export function decisionOutputSchema(
  definition: Pick<DecisionDefinition, 'name' | 'questions'>,
): Record<string, unknown> {
  const object = (properties: Record<string, unknown>) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  })
  const number = { type: 'number' }
  const answers = Object.fromEntries(
    Object.entries(definition.questions).map(([id, q]) => {
      const type = { const: q.type, type: 'string' }
      if (q.type === 'noul') {
        return [id, object({ type, noul: number })]
      }
      const keys =
        q.type === 'choice'
          ? Object.keys(q.criteria)
          : q.criteria.map((_, i) => String(i))
      const probabilities = object(
        Object.fromEntries(keys.map((k) => [k, number])),
      )
      return [
        id,
        object(
          q.type === 'choice'
            ? {
                type,
                choice: { type: 'string', enum: keys },
                probabilities,
                confidence: number,
              }
            : {
                type,
                score: number,
                legend: object(Object.fromEntries(keys.map((k) => [k, {}]))),
                probabilities,
                confidence: number,
              },
        ),
      ]
    }),
  )
  return object({
    decision: { type: 'string', const: definition.name },
    provider: { type: 'string', const: 'typesafe' },
    model: { type: 'string' },
    answers: object(answers),
    usage: object({ input_tokens: number, output_tokens: number }),
  })
}
