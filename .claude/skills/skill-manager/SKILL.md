---
name: skill-manager
description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations. It can also be used to validate, package, and manage existing skills in the .claude/skills directory.
allowed-tools:
  - Bash(./scripts/*.sh:*)
  - Bash(python3 ./scripts/*.py:*)
  - Read
---

# Skill Manager

This skill provides guidance for creating, managing, and validating skills in the Claude Code environment.

## About Skills

Skills are modular, self-contained packages that extend Claude's capabilities by providing
specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific
domains or tasks—they transform Claude from a general-purpose agent into a specialized agent
equipped with procedural knowledge that no model can fully possess.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## Core Principles

### Concise is Key

The context window is a public good. Skills share the context window with everything else Claude needs: system prompt, conversation history, other Skills' metadata, and the actual user request.

**Default assumption: Claude is already very smart.** Only add context Claude doesn't already have. Challenge each piece of information: "Does Claude really need this explanation?" and "Does this paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability:

**High freedom (text-based instructions)**: Use when multiple approaches are valid, decisions depend on context, or heuristics guide the approach.

**Medium freedom (pseudocode or scripts with parameters)**: Use when a preferred pattern exists, some variation is acceptable, or configuration affects behavior.

**Low freedom (specific scripts, few parameters)**: Use when operations are fragile and error-prone, consistency is critical, or a specific sequence must be followed.

Think of Claude as exploring a path: a narrow bridge with cliffs needs specific guardrails (low freedom), while an open field allows many routes (high freedom).

### Anatomy of a Skill

Every skill consists of a required SKILL.md file and optional bundled resources:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation intended to be loaded into context as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
```

#### SKILL.md (required)

Every SKILL.md consists of:

- **Frontmatter** (YAML): Contains `name` and `description` fields. These are the only fields that Claude reads to determine when the skill gets used, thus it is very important to be clear and comprehensive in describing what the skill is, and when it should be used.
- **Body** (Markdown): Instructions and guidance for using the skill. Only loaded AFTER the skill triggers (if at all).

#### Bundled Resources (optional)

##### Scripts (`scripts/`)

Executable code (Python/Bash/etc.) for tasks that require deterministic reliability or are repeatedly rewritten.

- **When to include**: When the same code is being rewritten repeatedly or deterministic reliability is needed
- **Example**: `scripts/rotate_pdf.py` for PDF rotation tasks
- **Benefits**: Token efficient, deterministic, may be executed without loading into context
- **Note**: Scripts may still need to be read by Claude for patching or environment-specific adjustments

##### References (`references/`)

Documentation and reference material intended to be loaded as needed into context to inform Claude's process and thinking.

- **When to include**: For documentation that Claude should reference while working
- **Examples**: `references/finance.md` for financial schemas, `references/api_docs.md` for API specifications
- **Use cases**: Database schemas, API documentation, domain knowledge, company policies, detailed workflow guides
- **Benefits**: Keeps SKILL.md lean, loaded only when Claude determines it's needed
- **Best practice**: If files are large (>10k words), include grep search patterns in SKILL.md
- **Avoid duplication**: Information should live in either SKILL.md or references files, not both

##### Assets (`assets/`)

Files not intended to be loaded into context, but rather used within the output Claude produces.

- **When to include**: When the skill needs files that will be used in the final output
- **Examples**: `assets/logo.png` for brand assets, `assets/template.pptx` for templates
- **Use cases**: Templates, images, icons, boilerplate code, fonts, sample documents
- **Benefits**: Separates output resources from documentation

#### What to Not Include in a Skill

A skill should only contain essential files that directly support its functionality. Do NOT create extraneous documentation or auxiliary files, including:

- README.md
- INSTALLATION_GUIDE.md
- QUICK_REFERENCE.md
- CHANGELOG.md
- etc.

The skill should only contain the information needed for an AI agent to do the job at hand.

## Skill Management Tools

This skill provides three essential scripts for skill management:

### 1. Initialize New Skill (`init_skill.py`)

Creates a new skill from template with proper structure.

**Usage:**
```bash
python .claude/skills/skill-manager/scripts/init_skill.py <skill-name> --path .claude/skills
```

**Examples:**
```bash
# Create a new API helper skill
python .claude/skills/skill-manager/scripts/init_skill.py api-helper --path .claude/skills

# Create a database management skill
python .claude/skills/skill-manager/scripts/init_skill.py database-manager --path .claude/skills
```

**What it does:**
- Creates skill directory with proper structure
- Generates SKILL.md template with frontmatter
- Creates example resource directories (scripts/, references/, assets/)
- Adds example files that can be customized or deleted

**Skill name requirements:**
- Hyphen-case identifier (e.g., 'data-analyzer')
- Lowercase letters, digits, and hyphens only
- Max 64 characters
- Must match directory name exactly

### 2. Validate Skill (`quick_validate.py`)

Validates a skill's structure and format.

**Usage:**
```bash
python .claude/skills/skill-manager/scripts/quick_validate.py <skill-directory>
```

**Examples:**
```bash
# Validate a single skill
python .claude/skills/skill-manager/scripts/quick_validate.py .claude/skills/my-skill

# Validate all skills (using bash loop)
for skill in .claude/skills/*/SKILL.md; do
  python .claude/skills/skill-manager/scripts/quick_validate.py "$(dirname "$skill")"
done
```

**What it checks:**
- SKILL.md exists
- Valid YAML frontmatter format
- Required fields (name, description)
- Naming conventions (hyphen-case, no invalid characters)
- Description quality (no angle brackets, proper length)
- No unexpected frontmatter properties

### 3. Package Skill (`package_skill.py`)

Packages a skill into a distributable .skill file.

**Usage:**
```bash
python .claude/skills/skill-manager/scripts/package_skill.py <skill-directory> [output-dir]
```

**Examples:**
```bash
# Package a skill to current directory
python .claude/skills/skill-manager/scripts/package_skill.py .claude/skills/my-skill

# Package to specific output directory
python .claude/skills/skill-manager/scripts/package_skill.py .claude/skills/my-skill ./dist
```

**What it does:**
- Validates the skill first (using quick_validate.py)
- Creates a .skill file (zip format with .skill extension)
- Includes all files and maintains directory structure
- Fails if validation errors exist

## Skill Creation Process

Skill creation involves these steps:

1. Understand the skill with concrete examples
2. Plan reusable skill contents (scripts, references, assets)
3. Initialize the skill (run init_skill.py)
4. Edit the skill (implement resources and write SKILL.md)
5. Package the skill (run package_skill.py)
6. Iterate based on real usage

Follow these steps in order, skipping only if there is a clear reason why they are not applicable.

### Step 1: Understanding the Skill with Concrete Examples

Skip this step only when the skill's usage patterns are already clearly understood.

To create an effective skill, clearly understand concrete examples of how the skill will be used. Ask questions like:

- "What functionality should this skill support?"
- "Can you give some examples of how this skill would be used?"
- "What would a user say that should trigger this skill?"

### Step 2: Planning the Reusable Skill Contents

Analyze each example to identify:

1. Scripts needed for repeated tasks
2. Reference documentation for domain knowledge
3. Assets needed for output generation

### Step 3: Initializing the Skill

Run the init_skill.py script to create the skill structure:

```bash
python .claude/skills/skill-manager/scripts/init_skill.py <skill-name> --path .claude/skills
```

### Step 4: Edit the Skill

**Writing Guidelines:** Always use imperative/infinitive form.

#### Update Frontmatter

- `name`: The skill name (hyphen-case, lowercase)
- `description`: Primary triggering mechanism. Include what the skill does AND when to use it.
  - Include all "when to use" information here
  - Example: "Comprehensive document creation, editing, and analysis. Use when Claude needs to work with professional documents (.docx files) for: (1) Creating new documents, (2) Modifying content, (3) Working with tracked changes..."

#### Write Body Content

- Include procedural knowledge and domain-specific details
- Reference bundled resources as needed
- Keep SKILL.md under 500 lines (split into reference files if longer)
- Use concrete examples over verbose explanations

### Step 5: Packaging the Skill

Once development is complete, package it:

```bash
python .claude/skills/skill-manager/scripts/package_skill.py <skill-directory>
```

The script will:
1. Validate the skill automatically
2. Create a .skill file if validation passes
3. Report errors if validation fails

### Step 6: Iterate

After testing the skill:
1. Use it on real tasks
2. Notice struggles or inefficiencies
3. Identify improvements needed
4. Implement changes and test again

## Progressive Disclosure Design Principle

Skills use a three-level loading system:

1. **Metadata (name + description)** - Always in context (~100 words)
2. **SKILL.md body** - When skill triggers (<5k words)
3. **Bundled resources** - As needed by Claude

Keep SKILL.md body under 500 lines. When approaching this limit:

**Pattern 1: High-level guide with references**
```markdown
# PDF Processing

## Quick start
[Core examples]

## Advanced features
- **Form filling**: See [FORMS.md](references/FORMS.md)
- **API reference**: See [REFERENCE.md](references/REFERENCE.md)
```

**Pattern 2: Domain-specific organization**
```
bigquery-skill/
├── SKILL.md (overview and navigation)
└── references/
    ├── finance.md
    ├── sales.md
    └── product.md
```

**Pattern 3: Framework-specific organization**
```
cloud-deploy/
├── SKILL.md (workflow + provider selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

## Best Practices

1. **Keep it concise** - Challenge every sentence's token cost
2. **Use concrete examples** - Show, don't tell
3. **Validate early and often** - Run quick_validate.py regularly
4. **Test scripts** - Ensure all scripts actually work
5. **Delete unused examples** - Remove template files you don't need
6. **Avoid duplication** - Put info in SKILL.md OR references, not both
7. **Reference properly** - Link to reference files from SKILL.md

## Managing Existing Skills

### Validate All Skills
```bash
for skill in .claude/skills/*/SKILL.md; do
  echo "Validating $(dirname "$skill")"
  python .claude/skills/skill-manager/scripts/quick_validate.py "$(dirname "$skill")"
done
```

### Update Skill Structure
When updating existing skills to match latest standards:
1. Validate current state
2. Identify issues
3. Fix structure/frontmatter
4. Re-validate
5. Test functionality

### Check for Naming Issues
Common issues:
- Non-hyphen-case names
- Uppercase letters
- Invalid characters
- Names too long (>64 chars)
- Descriptions too long (>1024 chars)

## Dependencies

This skill requires:
- Python 3.x
- PyYAML (for validation script)

Install dependencies:
```bash
pip3 install pyyaml
```

## Reference Documentation

For more detailed information, see:
- [Anthropic Skills README](docs/anthropic-skills-readme.md) - Official guidelines
