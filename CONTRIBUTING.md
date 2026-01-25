# Contributing

Thanks for your interest in contributing to the Ente Auth Browser Extension!

## Getting Started

1. Fork and clone the repository
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the development build:
   ```sh
   npm run dev
   ```
4. Load the extension in your browser (see [README](README.md#loading-in-chrome) for instructions)

## Development Workflow

1. Create a new branch for your feature or fix:
   ```sh
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Test thoroughly in both Chrome and Firefox if possible
4. Commit your changes with a clear, descriptive message
5. Push to your fork and open a pull request

## Code Style

- Use TypeScript for all new code
- Follow the existing code patterns and structure
- Keep components focused and single-purpose
- Add comments for complex logic

## Testing

Before submitting a PR, please test:

- [ ] Extension builds without errors (`npm run build`)
- [ ] Chrome: Extension loads and basic functionality works
- [ ] Firefox: Extension loads and basic functionality works
- [ ] Any new features work as expected
- [ ] Existing functionality isn't broken

## Reporting Issues

When reporting bugs, please include:

- Browser and version
- Steps to reproduce
- Expected vs actual behavior
- Any error messages from the browser console

## Feature Requests

Feature requests are welcome! Please open an issue describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Get in Touch

Have questions or want to discuss contributions? Reach out to **iPcGuy** on the [Ente Discord server](https://discord.gg/z2YVKkycX3).

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license.
