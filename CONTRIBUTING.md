# Contributing

Thanks for helping improve Tooltip classic.

## Get started

1. Fork the repository and clone your fork.
2. Create a branch for your change.
3. Install dependencies:

   ```sh
   npm ci
   ```

## Make a change

Keep changes focused and follow the existing code style. For a new feature or a larger change, open an issue first so we can agree on the approach.

When changing tooltip behavior, check both Reading view and Live Preview. Keep keyboard use and screen-reader support in mind, and avoid adding dependencies unless they are needed.

## Check your change

Run the test suite and build:

```sh
npm test
npm run build
```

Also try the plugin in a separate Obsidian vault. See [Build and release](docs/RELEASING.md) for setup and release details.

## Open a pull request

Push your branch to your fork and open a pull request against `main`. Describe what changed and how you checked it. Include screenshots or a short recording for visible changes, and mention any checks you could not run.
