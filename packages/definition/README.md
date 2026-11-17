# @swirls/definition

The deployment definition: the versioned schema a `.swirls` project compiles to
and a runtime consumes. It is the contract between the language and any runtime
that executes it.

The package is Zod schemas and the types inferred from them, with no runtime
dependency other than `zod`.

| Import                                   | Holds                                                     |
| ---------------------------------------- | --------------------------------------------------------- |
| `@swirls/definition`                     | The deployment definition schema                          |
| `@swirls/definition/schemas`             | Node types, resource names, output formats, review config |
| `@swirls/definition/decision`            | Decision questions and responses                          |
| `@swirls/definition/device`              | Device selectors                                          |
| `@swirls/definition/file-values`         | File values and retention                                 |
| `@swirls/definition/connection-mode`     | Managed and self-managed connections                      |
| `@swirls/definition/managed-database`    | Managed database shapes                                   |
| `@swirls/definition/app-*`               | App audience, avatar, brand tokens and themes             |
| `@swirls/definition/secrets/vendor-keys` | Vendor keys a runtime can manage                          |
