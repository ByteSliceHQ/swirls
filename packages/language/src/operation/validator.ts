/**
 * Validation for `operation` blocks and `type: device` nodes.
 */

import { deviceOsSchema, deviceSelectorSchema, deviceTagSchema } from '@swirls/definition/device'
import { DEVICE_NODE_WAIT_SECONDS_MAX, resourceNameSchema } from '@swirls/definition/schemas'

import type { ConfigValue, Diagnostic, NodeDecl, SourceRange, SwirlsFile } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import type { OperationDecl } from './ast'

/** Limits the daemon and the signed dispatch enforce. */
const MAX_TIMEOUT_SECONDS = 3_600
const MAX_SCRIPT_CHARS = 512_000
const MAX_NAME_CHARS = 128
const MIN_WAIT_SECONDS = 30

const RUN_AS = ['system', 'signed_in_user']

const SCRIPT_EXTENSIONS = { ps: '.ps1', sh: '.sh' }
const SCRIPT_LABELS = { ps: '@ps', sh: '@sh' }

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function operationBlockMap(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, OperationDecl> {
  const operations = new Map<string, OperationDecl>()

  for (const operation of ast.operations ?? []) {
    operations.set(operation.name, operation)
  }

  for (const [name, operation] of workspace?.operationBlocks ?? []) {
    operations.set(name, operation)
  }

  return operations
}

export function validateOperationBlocks(ast: SwirlsFile): Diagnostic[] {
  const out: Diagnostic[] = []
  const seen = new Set<string>()

  for (const operation of ast.operations ?? []) {
    const name = resourceNameSchema.safeParse(operation.name)

    if (!name.success) {
      const reason = name.error.issues[0]?.message ?? 'Invalid name'
      out.push(diag(`Operation name: ${reason}`, operation.nameRange))
    } else if (operation.name.length > MAX_NAME_CHARS) {
      out.push(
        diag(`Operation name must be at most ${MAX_NAME_CHARS} characters`, operation.nameRange),
      )
    }

    if (seen.has(operation.name)) {
      out.push(diag(`Duplicate operation "${operation.name}"`, operation.nameRange))
    }

    seen.add(operation.name)

    const { command } = operation

    if (!command) {
      out.push(
        diag(
          `Operation "${operation.name}" requires a "command": the script it runs`,
          operation.range,
        ),
      )
    } else if (command.path !== undefined) {
      const extension = SCRIPT_EXTENSIONS[command.lang]

      if (!command.path.trim().toLowerCase().endsWith(extension)) {
        out.push(
          diag(`${SCRIPT_LABELS[command.lang]} must reference a ${extension} file`, command.range),
        )
      }
    }

    if (command?.script !== undefined) {
      if (command.script.trim() === '') {
        out.push(diag(`Operation "${operation.name}" has an empty command`, command.range))
      } else if (command.script.length > MAX_SCRIPT_CHARS) {
        out.push(
          diag(`Operation command must be at most ${MAX_SCRIPT_CHARS} characters`, command.range),
        )
      } else if (command.script.includes('\u0000')) {
        out.push(diag('Operation command must not contain a NUL character', command.range))
      }
    }

    if (operation.platform !== undefined) {
      const range = operation.platformRange ?? operation.range

      if (!deviceOsSchema.safeParse(operation.platform).success) {
        out.push(diag('Operation "platform" must be windows, linux or macos', range))
      } else if (operation.platform === 'windows' && command?.lang === 'sh') {
        out.push(diag('An @sh command cannot run on windows. Use @ps, or another platform.', range))
      }
    }

    if (operation.runAs !== undefined) {
      const range = operation.runAsRange ?? operation.range

      if (!RUN_AS.includes(operation.runAs)) {
        out.push(diag('Operation "runAs" must be system or signed_in_user', range))
      } else if (operation.runAs === 'signed_in_user') {
        out.push(
          diag(
            'The device daemon cannot run as the signed-in user yet. Devices will refuse this operation until it can.',
            range,
            'warning',
          ),
        )
      }
    }

    if (
      operation.timeout !== undefined &&
      (!Number.isInteger(operation.timeout) ||
        operation.timeout < 1 ||
        operation.timeout > MAX_TIMEOUT_SECONDS)
    ) {
      out.push(
        diag(
          `Operation "timeout" must be a whole number of seconds from 1 to ${MAX_TIMEOUT_SECONDS}`,
          operation.timeoutRange ?? operation.range,
        ),
      )
    }
  }

  return out
}

/** The plain value of a literal config value, or undefined for code. */
function literalOf(cv: ConfigValue): unknown {
  switch (cv.kind) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
      return cv.value
    case 'array':
      return cv.value.map(literalOf)
    case 'object':
      return Object.fromEntries(
        Object.entries(cv.value).map(([key, value]) => [key, literalOf(value)]),
      )
    default:
      return undefined
  }
}

function validateSelector(cv: ConfigValue, operation: OperationDecl | undefined): Diagnostic[] {
  if (cv.kind !== 'object') {
    return [
      diag(
        'Device node "devices" must be a selector such as { tags: ["kiosk"], os: windows }',
        cv.range,
      ),
    ]
  }

  const out: Diagnostic[] = []

  for (const [key, value] of Object.entries(cv.value)) {
    if (key !== 'tags' && key !== 'os') {
      out.push(diag(`Unknown selector field "${key}"`, value.range))
    }
  }

  const tags = cv.value.tags

  if (tags && tags.kind !== 'array') {
    out.push(diag('Selector "tags" must be a list of tags', tags.range))
  }

  if (tags?.kind === 'array') {
    for (const tag of tags.value) {
      if (!deviceTagSchema.safeParse(literalOf(tag)).success) {
        out.push(
          diag(
            'A tag is lowercase and uses letters, numbers, dots, dashes, underscores and colons',
            tag.range,
          ),
        )
      }
    }
  }

  const os = cv.value.os

  if (os && !deviceOsSchema.safeParse(literalOf(os)).success) {
    out.push(diag('Selector "os" must be windows, linux or macos', os.range))
  }

  if (out.length > 0) {
    return out
  }

  const selector = deviceSelectorSchema.safeParse(literalOf(cv))

  if (!selector.success) {
    return [
      diag(
        'A selector needs at least one tag or an os. There is no selector for every device.',
        cv.range,
      ),
    ]
  }

  if (
    operation?.platform !== undefined &&
    selector.data.os !== undefined &&
    selector.data.os !== operation.platform
  ) {
    return [
      diag(
        `Operation "${operation.name}" runs on ${operation.platform}, so this selector matches no device it can run on`,
        os?.range ?? cv.range,
      ),
    ]
  }

  return []
}

export function validateDeviceNodes(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const operations = operationBlockMap(ast, options?.workspace)

  function checkNode(node: NodeDecl) {
    for (const child of node.subgraph?.nodes ?? []) {
      checkNode(child)
    }

    if (node.type !== 'device') {
      return
    }

    if (node.outputFormat) {
      out.push(diag('Node type "device" does not accept "format"', node.range))
    }

    // A review replaces a node's own work with the approval form, so a
    // device node carrying one would never reach a device.
    if (node.reviewConfig?.enabled) {
      out.push(
        diag(
          'A device node cannot carry a review. Put the review on a separate node upstream of it.',
          node.range,
        ),
      )
    }

    let operation: OperationDecl | undefined
    const operationCv = node.configFields.operation

    if (operationCv) {
      if (operationCv.kind !== 'string' || !operationCv.value.trim()) {
        out.push(
          diag('Device node "operation" must name a top-level operation block', operationCv.range),
        )
      } else {
        operation = operations.get(operationCv.value.trim())

        if (!operation) {
          out.push(
            diag(
              `Device node references undefined operation "${operationCv.value.trim()}"`,
              operationCv.range,
            ),
          )
        }
      }
    }

    const deviceCv = node.configFields.device
    const devicesCv = node.configFields.devices

    if (deviceCv && devicesCv) {
      out.push(
        diag(
          'Device node takes "device" (one device id) or "devices" (a selector), not both',
          devicesCv.range,
        ),
      )
    } else if (!deviceCv && !devicesCv) {
      out.push(
        diag('Device node requires "device" (one device id) or "devices" (a selector)', node.range),
      )
    }

    if (
      deviceCv &&
      deviceCv.kind !== 'string' &&
      deviceCv.kind !== 'ts_block' &&
      deviceCv.kind !== 'ts_file_ref'
    ) {
      out.push(
        diag(
          'Device node "device" must be a device id: a quoted string, or @ts returning one',
          deviceCv.range,
        ),
      )
    }

    if (devicesCv) {
      out.push(...validateSelector(devicesCv, operation))
    }

    const inputCv = node.configFields.input

    if (
      inputCv &&
      inputCv.kind !== 'object' &&
      inputCv.kind !== 'ts_block' &&
      inputCv.kind !== 'ts_file_ref'
    ) {
      out.push(diag('Device node "input" must be an object, or @ts returning one', inputCv.range))
    }

    const waitCv = node.configFields.waitSeconds

    if (
      waitCv &&
      (waitCv.kind !== 'number' ||
        !Number.isInteger(waitCv.value) ||
        waitCv.value < MIN_WAIT_SECONDS ||
        waitCv.value > DEVICE_NODE_WAIT_SECONDS_MAX)
    ) {
      out.push(
        diag(
          `Device node "waitSeconds" must be a whole number from ${MIN_WAIT_SECONDS} to ${DEVICE_NODE_WAIT_SECONDS_MAX}`,
          waitCv.range,
        ),
      )
    }
  }

  for (const workflow of ast.workflows ?? []) {
    for (const node of workflow.nodes) {
      checkNode(node)
    }
  }

  return out
}
