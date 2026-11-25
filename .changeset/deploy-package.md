---
'@swirls/deploy': minor
---

Add `@swirls/deploy`, which lowers `.swirls` source files into a deployment definition.

- `lowerSwirlsSources(files, options)` takes a project as a map of path to text and returns the definition, every diagnostic, the source files with their hashes and the skill files. It reads nothing from disk or the environment and does not throw on a problem in the sources.
- The steps it runs are exported for a host that reads a directory: `mergeProjectSwirlsFiles`, `buildDeploymentDefinitionPayload`, `collectDeploymentSourceFiles`, `collectDeploymentSkillFiles` and the fingerprint functions.
- Ids come from an injectable `newId`, a UUIDv7 by default.
