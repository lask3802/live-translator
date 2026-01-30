# Contributing to Live Translator

First off, thank you for considering contributing to Live Translator! 🎉

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to providing a welcoming and inclusive environment. Please be respectful and constructive in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/live-translator.git
   cd live-translator
   ```
3. Set up the development environment (see [README.md](README.md))
4. Create a new branch for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Branch Naming Convention

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(extension): add audio visualization in sidepanel
fix(server): resolve VAD buffer overflow issue
docs: update installation instructions
```

## Pull Request Process

1. Ensure your code follows our coding standards
2. Update documentation if needed
3. Add tests for new features
4. Ensure all tests pass
5. Update the CHANGELOG.md if applicable
6. Submit your PR with a clear title and description

### PR Title Format

```
<type>(<scope>): <short description>
```

### PR Description Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested your changes

## Checklist
- [ ] My code follows the project's coding standards
- [ ] I have updated the documentation
- [ ] I have added tests that prove my fix/feature works
- [ ] All new and existing tests pass
```

## Coding Standards

### TypeScript (Extension)

- Use TypeScript strict mode
- Follow ESLint configuration
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Python (Server)

- Follow PEP 8 style guide
- Use type hints
- Document functions with docstrings
- Keep functions focused and small

### General

- Keep files under 300 lines when possible
- Write self-documenting code
- Add comments for complex logic
- Avoid magic numbers - use constants

## Reporting Bugs

When reporting bugs, please include:

1. **Environment**: OS, browser version, Python version
2. **Steps to Reproduce**: Clear, numbered steps
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Screenshots/Logs**: If applicable
6. **Additional Context**: Any other relevant information

Use the bug report issue template when available.

## Suggesting Features

Feature suggestions are welcome! Please include:

1. **Problem Statement**: What problem does this solve?
2. **Proposed Solution**: Your idea for the solution
3. **Alternatives Considered**: Other approaches you've thought about
4. **Additional Context**: Mockups, examples, etc.

Use the feature request issue template when available.

---

Thank you for contributing! 🙏
