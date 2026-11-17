/**
 * @file Tree-sitter grammar for the Swirls DSL (`.swirls` files).
 *
 * This grammar exists for editors: highlighting, folding, indentation and
 * language injections. It is deliberately more permissive than the compiler's
 * hand-written parser in `packages/language`, which stays the source of truth
 * for what is valid. Instead of one rule per block kind it models the shapes
 * every block is built from:
 *
 *   block             kind [name] { ... }          workflow notify { ... }
 *   field             key: value                   label: "Notify"
 *   edge              a -> b, a -["label"]-> b     root -> send
 *   trigger_binding   kind:resource -> workflow    form:contact -> notify
 *   grant             effect role -> kind target   allow sales -> agent *
 *
 * so a new block kind or field name needs no grammar change.
 *
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/**
 * `@lang { ... }`. The body is raw text in another language, so it is read by
 * the external scanner (src/scanner.c), which finds the closing brace the same
 * way the Swirls lexer does for that language.
 *
 * @param {GrammarSymbols<string>} $
 * @param {string[]} names
 * @param {RuleOrLiteral} content
 */
function embedded($, names, content) {
  return seq(
    '@',
    field('language', alias(names.length > 1 ? choice(...names) : names[0], $.embedded_language)),
    '{',
    optional(field('content', alias(content, $.embedded_content))),
    '}',
  )
}

module.exports = grammar({
  name: 'swirls',

  word: ($) => $.identifier,

  extras: ($) => [/\s/, $.line_comment, $.block_comment],

  externals: ($) => [
    $._ts_content,
    $._json_content,
    $._sql_content,
    $._prisma_content,
    $._ps_content,
    $._sh_content,
    // Never used in a rule. Tree-sitter marks every external token valid while
    // it recovers from an error; the scanner sees this one and stands down.
    $._error_sentinel,
  ],

  supertypes: ($) => [$._statement, $._value],

  rules: {
    source_file: ($) => repeat($._statement),

    _statement: ($) => choice($.block, $.field, $.edge, $.trigger_binding, $.grant),

    // workflow notify { ... } / root { ... } / section "Today" { ... }
    block: ($) =>
      seq(
        field('kind', $.identifier),
        optional(field('name', choice($.identifier, $.string))),
        field('body', $.body),
      ),

    body: ($) => seq('{', repeat(choice($._statement, ',')), '}'),

    // label: "Notify" / "type": "object" / page: home { label: "Dashboard" }
    field: ($) =>
      seq(
        field('key', choice($.identifier, $.string)),
        ':',
        choice(field('value', $._value), seq(field('value', $.reference), field('body', $.object))),
      ),

    // root -> send / route -["urgent"]-> escalate
    edge: ($) =>
      seq(
        field('source', $.identifier),
        choice('->', $.labeled_arrow),
        field('target', $.identifier),
      ),

    labeled_arrow: ($) => seq('-[', field('label', $.string), ']->'),

    // form:contact -> notify (inside a trigger block)
    trigger_binding: ($) =>
      seq(
        field('kind', $.identifier),
        ':',
        field('resource', $.identifier),
        '->',
        field('workflow', $.identifier),
      ),

    // allow sales -> agent accountant { tools: [...] } / deny finance -> agent *
    grant: ($) =>
      prec.right(
        seq(
          field('effect', $.identifier),
          field('role', $.identifier),
          '->',
          field('target_kind', $.identifier),
          field('target', choice($.identifier, $.wildcard)),
          optional(field('body', $.body)),
        ),
      ),

    wildcard: (_) => '*',

    _value: ($) =>
      choice(
        $.string,
        $.number,
        $.duration,
        $.boolean,
        $.null,
        $.path,
        $.reference,
        $.object,
        $.array,
        $.embedded_block,
        $.file_reference,
      ),

    object: ($) => seq('{', repeat(choice($._statement, ',')), '}'),

    array: ($) => seq('[', repeat(choice($._value, ',')), ']'),

    // A bare word, or a dotted path such as `vendor.API_KEY` or `widget.user_menu`.
    reference: ($) => seq($.identifier, repeat(seq('.', $.identifier))),

    embedded_block: ($) =>
      choice(
        // @openui is scanned with the TypeScript rules, as in the Swirls lexer.
        embedded($, ['ts', 'openui'], $._ts_content),
        embedded($, ['json'], $._json_content),
        embedded($, ['sql'], $._sql_content),
        embedded($, ['prisma'], $._prisma_content),
        embedded($, ['ps'], $._ps_content),
        embedded($, ['sh'], $._sh_content),
      ),

    // @ts "./normalize.ts.swirls" / @ps "scripts/collect.ps1" / @sh "collect.sh"
    file_reference: ($) =>
      seq(
        '@',
        field('language', alias(choice('ts', 'ps', 'sh'), $.embedded_language)),
        field('path', $.string),
      ),

    string: ($) =>
      seq('"', repeat(choice($.string_content, $.escape_sequence)), token.immediate('"')),

    // Strings may span lines; the Swirls lexer only stops at an unescaped quote.
    string_content: (_) => token.immediate(prec(1, /[^"\\]+/)),

    escape_sequence: (_) => token.immediate(/\\[\s\S]/),

    number: (_) => /-?[0-9][0-9.]*/,

    // A number with a unit, as in `retention: 30d`. Most durations are written
    // as strings instead ("30m"); the highlight query picks those up by shape.
    duration: (_) => /[0-9]+[a-zA-Z]+/,

    boolean: (_) => choice('true', 'false'),

    null: (_) => 'null',

    // Unquoted request path: /chat.postMessage, /v1/users
    path: (_) => /\/([a-zA-Z0-9_.-][a-zA-Z0-9_./-]*)?/,

    identifier: (_) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    line_comment: (_) => token(seq('//', /[^\n]*/)),

    // A block comment directly before a top-level block is its doc comment.
    block_comment: (_) => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),
  },
})
