---
- this frontmatter
- is a YAML list
- not a mapping
---

# List Frontmatter

The block above is valid YAML, but a sequence rather than a mapping. Readers should report it as a
frontmatter error and use an empty mapping. Writers must refuse to "fix" it silently.
