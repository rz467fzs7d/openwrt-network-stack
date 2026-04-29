# Claude Code Skills: Official Guidelines

This repository contains Claude Skills: folders of instructions, scripts and resources that help Claude complete specialized tasks. The examples include creative applications, technical tasks, and enterprise workflows, along with document creation & editing skills under the hood.

## Basic Skill Structure

A skill requires a folder with a SKILL.md file containing:

- YAML frontmatter with:
  * `name`: Unique identifier (lowercase, hyphens)
  * `description`: What the skill does and when to use it

## Installation Methods

### Claude Code Plugin Marketplace

```bash
/plugin marketplace add anthropics/skills
/plugin install document-skills@anthropic-agent-skills
/plugin install example-skills@anthropic-agent-skills
```

Skills are referenced by name in prompts.

## License Considerations

- Example skills are Apache 2.0 open source
- Document skills are source-available (not open source)
- "These skills are provided for demonstration and educational purposes only"

## Best Practices

- Skills follow a simple folder structure
- Use template-skill as starting point
- Instructions should be clear and specific
- Include examples and guidelines in markdown

## Skill Format

Each skill should have:

1. A folder named after the skill (lowercase, hyphens)
2. A `SKILL.md` file with YAML frontmatter
3. Optional supporting files (docs, scripts, templates)

### YAML Frontmatter Example

```yaml
---
name: your-skill-name
description: What the skill does and when to use it
---
```

### Naming Conventions

- Use lowercase letters and hyphens only
- Names should be descriptive and unique
- Consider using numeric prefixes for ordering (e.g., 10-docker, 20-network)

## Skill Creation Process

1. Create a new folder with the skill name
2. Create a SKILL.md file with proper frontmatter
3. Write clear instructions in the markdown
4. Include examples and usage guidelines
5. Test the skill functionality

## Documentation

- Each skill should be self-documenting
- Include usage examples
- Provide clear descriptions of functionality
- Note any dependencies or requirements

## Quality Guidelines

- Skills should be reliable and consistent
- Instructions should be unambiguous
- Include error handling where appropriate
- Test thoroughly before release