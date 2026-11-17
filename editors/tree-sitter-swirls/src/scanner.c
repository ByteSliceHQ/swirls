/**
 * External scanner for the Swirls grammar.
 *
 * It produces one kind of token: the raw body of an embedded block such as
 * `@ts { ... }`. The body is text in another language, and the only way to
 * find where it ends is to count braces while skipping the places that
 * language can hold a brace that is not structure (strings, comments,
 * template literals, here-strings).
 *
 * Each scan function mirrors the matching `scan*BlockBody` method of the
 * Swirls lexer (packages/language/src/lexer.ts), so a block ends in the same
 * place here as it does for the compiler. Keep the two in step.
 *
 * The scanner keeps no state between calls.
 */

#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>

enum TokenType {
  TS_CONTENT,
  JSON_CONTENT,
  SQL_CONTENT,
  PRISMA_CONTENT,
  PS_CONTENT,
  SH_CONTENT,
  ERROR_SENTINEL,
};

typedef struct {
  TSLexer *lexer;
  // True once the body holds anything other than whitespace.
  bool has_content;
} Scan;

static inline bool at_eof(Scan *s) { return s->lexer->eof(s->lexer); }

static inline int32_t peek(Scan *s) { return s->lexer->lookahead; }

static inline bool is_space(int32_t c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\r';
}

static inline void advance(Scan *s) {
  if (!is_space(s->lexer->lookahead)) {
    s->has_content = true;
  }
  s->lexer->advance(s->lexer, false);
}

static void skip_line(Scan *s) {
  while (!at_eof(s) && peek(s) != '\n') {
    advance(s);
  }
}

/** Skip to just past `<first><second>`, e.g. the end of a block comment. */
static void skip_past_pair(Scan *s, int32_t first, int32_t second) {
  while (!at_eof(s)) {
    int32_t c = peek(s);
    advance(s);
    while (c == first && peek(s) == first) {
      advance(s);
    }
    if (c == first && peek(s) == second) {
      advance(s);
      return;
    }
  }
}

/** Skip a quoted string whose opening quote is consumed. `escape` skips the next character. */
static void skip_string(Scan *s, int32_t quote, int32_t escape) {
  while (!at_eof(s)) {
    int32_t c = peek(s);
    advance(s);
    if (c == quote) {
      return;
    }
    if (escape != 0 && c == escape && !at_eof(s)) {
      advance(s);
    }
  }
}

static void skip_ts_brace_group(Scan *s);

/** Skip a template literal whose opening backtick is consumed. */
static void skip_template_literal(Scan *s) {
  while (!at_eof(s)) {
    int32_t c = peek(s);
    advance(s);
    if (c == '\\') {
      if (!at_eof(s)) {
        advance(s);
      }
    } else if (c == '`') {
      return;
    } else if (c == '$' && peek(s) == '{') {
      advance(s);
      skip_ts_brace_group(s);
    }
  }
}

/**
 * One step of TypeScript scanning: skip a comment, string or template literal
 * if one starts here. Returns false when the next character is anything else,
 * leaving it unconsumed.
 */
static bool skip_ts_trivia(Scan *s) {
  switch (peek(s)) {
    case '/':
      advance(s);
      if (peek(s) == '/') {
        skip_line(s);
      } else if (peek(s) == '*') {
        advance(s);
        skip_past_pair(s, '*', '/');
      }
      return true;
    case '"':
      advance(s);
      skip_string(s, '"', '\\');
      return true;
    case '\'':
      advance(s);
      skip_string(s, '\'', '\\');
      return true;
    case '`':
      advance(s);
      skip_template_literal(s);
      return true;
    default:
      return false;
  }
}

/** Skip a `${ ... }` group inside a template literal, through its closing brace. */
static void skip_ts_brace_group(Scan *s) {
  unsigned depth = 1;
  while (depth > 0 && !at_eof(s)) {
    if (skip_ts_trivia(s)) {
      continue;
    }
    if (peek(s) == '{') {
      depth++;
    } else if (peek(s) == '}') {
      depth--;
    }
    advance(s);
  }
}

/**
 * The shared brace counter. Handles `{` and `}` and returns true when the
 * block's own closing brace is next, which is left unconsumed.
 */
static bool at_block_end(Scan *s, unsigned *depth) {
  if (peek(s) == '{') {
    (*depth)++;
  } else if (peek(s) == '}') {
    if (*depth == 1) {
      return true;
    }
    (*depth)--;
  }
  return false;
}

/** `@ts { ... }` and `@openui { ... }`. */
static void scan_ts(Scan *s) {
  unsigned depth = 1;
  while (!at_eof(s)) {
    if (skip_ts_trivia(s)) {
      continue;
    }
    if (at_block_end(s, &depth)) {
      return;
    }
    advance(s);
  }
}

/** `@json { ... }`: only strings can hide a brace. */
static void scan_json(Scan *s) {
  unsigned depth = 1;
  while (!at_eof(s)) {
    if (peek(s) == '"') {
      advance(s);
      skip_string(s, '"', '\\');
      continue;
    }
    if (at_block_end(s, &depth)) {
      return;
    }
    advance(s);
  }
}

/** `@sql { ... }`: `--` and block comments, '' escaped single quotes, quoted identifiers. */
static void scan_sql(Scan *s) {
  unsigned depth = 1;
  while (!at_eof(s)) {
    switch (peek(s)) {
      case '-':
        advance(s);
        if (peek(s) == '-') {
          skip_line(s);
        }
        continue;
      case '/':
        advance(s);
        if (peek(s) == '*') {
          advance(s);
          skip_past_pair(s, '*', '/');
        }
        continue;
      case '\'':
        // A doubled quote reads as two strings side by side, which balances
        // the same way as one string with an escaped quote.
        advance(s);
        skip_string(s, '\'', 0);
        continue;
      case '"':
        advance(s);
        skip_string(s, '"', '\\');
        continue;
      default:
        break;
    }
    if (at_block_end(s, &depth)) {
      return;
    }
    advance(s);
  }
}

/** `@prisma { ... }`: double-quoted strings and `//` comments. */
static void scan_prisma(Scan *s) {
  unsigned depth = 1;
  while (!at_eof(s)) {
    if (peek(s) == '/') {
      advance(s);
      if (peek(s) == '/') {
        skip_line(s);
      }
      continue;
    }
    if (peek(s) == '"') {
      advance(s);
      skip_string(s, '"', '\\');
      continue;
    }
    if (at_block_end(s, &depth)) {
      return;
    }
    advance(s);
  }
}

/** A PowerShell here-string, after `@` and the quote: ends at a line starting with the quote and `@`. */
static void skip_here_string(Scan *s, int32_t quote) {
  while (!at_eof(s)) {
    int32_t c = peek(s);
    advance(s);
    if (c == '\n' && peek(s) == quote) {
      advance(s);
      if (peek(s) == '@') {
        advance(s);
        return;
      }
    }
  }
}

/** `@ps { ... }` and `@sh { ... }`. */
static void scan_script(Scan *s, bool powershell) {
  unsigned depth = 1;
  bool at_word_start = true;
  while (!at_eof(s)) {
    int32_t c = peek(s);
    bool word_start = at_word_start;
    at_word_start = is_space(c);

    if (powershell && c == '<') {
      advance(s);
      if (peek(s) == '#') {
        skip_past_pair(s, '#', '>');
      }
      continue;
    }
    if (c == '#' && word_start) {
      skip_line(s);
      continue;
    }
    if (powershell && c == '@') {
      advance(s);
      int32_t quote = peek(s);
      if (quote == '"' || quote == '\'') {
        advance(s);
        if (peek(s) == '\n' || peek(s) == '\r') {
          skip_here_string(s, quote);
        } else {
          skip_string(s, quote, quote == '"' ? '`' : 0);
        }
      }
      continue;
    }
    if (c == '\'') {
      advance(s);
      skip_string(s, '\'', 0);
      continue;
    }
    if (c == '"') {
      advance(s);
      skip_string(s, '"', powershell ? '`' : '\\');
      continue;
    }
    if (at_block_end(s, &depth)) {
      return;
    }
    advance(s);
  }
}

void *tree_sitter_swirls_external_scanner_create(void) { return NULL; }

void tree_sitter_swirls_external_scanner_destroy(void *payload) { (void)payload; }

unsigned tree_sitter_swirls_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_swirls_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_swirls_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  (void)payload;

  if (valid_symbols[ERROR_SENTINEL]) {
    return false;
  }

  Scan s = {.lexer = lexer, .has_content = false};

  if (valid_symbols[TS_CONTENT]) {
    scan_ts(&s);
    lexer->result_symbol = TS_CONTENT;
  } else if (valid_symbols[JSON_CONTENT]) {
    scan_json(&s);
    lexer->result_symbol = JSON_CONTENT;
  } else if (valid_symbols[SQL_CONTENT]) {
    scan_sql(&s);
    lexer->result_symbol = SQL_CONTENT;
  } else if (valid_symbols[PRISMA_CONTENT]) {
    scan_prisma(&s);
    lexer->result_symbol = PRISMA_CONTENT;
  } else if (valid_symbols[PS_CONTENT]) {
    scan_script(&s, true);
    lexer->result_symbol = PS_CONTENT;
  } else if (valid_symbols[SH_CONTENT]) {
    scan_script(&s, false);
    lexer->result_symbol = SH_CONTENT;
  } else {
    return false;
  }

  // A body that is empty or only whitespace has no content node; the
  // whitespace is then skipped as usual and `}` closes the block.
  return s.has_content;
}
