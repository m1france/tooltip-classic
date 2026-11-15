# Build and release

Develop and test in a separate Obsidian vault.

```sh
npm ci
npm test
npm run build
```

The build uses Node.js to assemble `main.js` from the source and the license notice. Obsidian provides the runtime APIs.

Keep `README.md`, `LICENSE`, and `manifest.json` at the root of the public GitHub repository. Create a GitHub release with a tag identical to the version in `manifest.json`, with no `v` prefix. Attach `main.js`, `manifest.json`, and `styles.css` separately. For the first release in the directory, submit the GitHub repository URL through the Obsidian Community directory. [Official submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin)
