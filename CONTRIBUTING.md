# Contributing

Thank you for your interest in contributing! We welcome all contributions, from bug reports and feature requests to code changes. Please feel free to put up a PR for any issue or feature request.

## Code of Conduct

Please be respectful to others in all interactions related to this project. We expect contributors to adhere to the [code of conduct](./CODE_OF_CONDUCT.md).

## Creating issues

If you find any bugs, have suggestions for improvements, or encounter unexpected behavior, please open an issue.
Creating an issue before submitting a PR helps us discuss the problem or feature request in advance.

## Submitting Pull Requests

We are grateful for any pull requests! To ensure a smooth contribution process, please follow these steps:

### Workflow for Contributing

1. Fork this repository.
2. Clone your fork
3. Create a new branch
4. Make your changes: Implement your feature, fix the issue, or improve the code.
5. Test your changes: Please make sure your changes are tested locally (for all affected devices).

### Testing Your Changes

We highly encourage testing your changes before submitting a pull request.

- Run the Metro server:
  ```bash
  yarn start:reset
  ```
- Run the app on iOS:
  ```bash
  yarn ios
  ```
- Run the app on Android:
  ```bash
  yarn android
  ```

### Linting and Type Checking

Make sure your code passes the lint and type check processes:

- **Lint your code** with ESLint:
  ```bash
  yarn lint
  ```
- **Type check** your code with TypeScript:
  ```bash
  yarn typecheck
  ```


### Writing Tests

Please add tests for any new features or changes. We use **Jest** for unit testing:

- Run tests:
  ```bash
  yarn test
  ```

If your changes affect the app's behavior, ensure you include or update tests as appropriate.

### Translations (Localization)

PocketPal uses [Weblate](https://hosted.weblate.org/translate/pocketpal-ai) for managing translations. When adding or changing user-facing strings:

- **Only edit `src/locales/en.json`** (the English source file). Do not edit `ja.json`, `zh.json`, or other language files directly — they are managed by translators through Weblate and will be overwritten.
- Use `{{placeholder}}` syntax (double braces) for dynamic values, e.g. `"Imported {{count}} sessions"`.
- Run `yarn l10n:validate` to check that your JSON is valid and placeholders are consistent.

**To contribute translations**, visit [PocketPal on Weblate](https://hosted.weblate.org/translate/pocketpal-ai) — no code changes needed.

### Commit Message Guidelines

We follow the **Conventional Commits** specification for our commit messages to ensure clarity and consistency. Use one of the following prefixes for your commits:

- `feat`: New features (e.g., `feat: add new model support functionality`).
- `fix`: Bug fixes (e.g., `fix: resolve crash on app startup`).
- `docs`: Documentation changes (e.g., `docs: update README.md`).
- `chore`: Refactoring, tooling, testing, or configuration changes (e.g., `chore: update CI pipeline`).

### Opening a Pull Request

1. Commit your changes following the commit message guidelines.
2. Push your branch to your fork.
3. Open a pull request from your branch in your fork to the `main` branch of this repository.
4. Follow the pull request template and fill in all relevant details.

Before opening a pull request, make sure:
- Your changes are focused and kept to a **single logical change**.
- Your code is linted and passes type checks.
- Tests are added or updated if applicable.
