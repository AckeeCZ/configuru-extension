<div align="center">

<img src="./resources/logo.png" height="170"/>

# Configuru - VS Code Extension

VS Code extension for the [Configuru](https://github.com/AckeeCZ/configuru) library.

</div>

## Features
Every feature can be enabled/disabled using its configuration key in VSCode settings. All enabled by default.

### Suggestions of name variables
🔧 `configuru.features.suggestEnvVariables`

The extension suggests the names of the variables that are present in the `env.jsonc` file.
![Example](./resources/suggestions.gif)

### Highlighting of invalid variables
🔧 `configuru.features.highlightInvalidVariables`

If your `config.ts` file contains a variable that is not present in the `env.jsonc` file, the extension will underline it as an error.
![Example](./resources/error_highlighting.png)

### Highlighting of secrets missing a description
🔧 `configuru.features.highlightSecretsMissingDescription`

If your `.env.jsonc` file contains a secret key that does not have description provided in a comment, the extension will underline it as a warning.
![Example](./resources/secret_missing_desdescription_warning.jpeg)

### Highlighting of secrets with unsafe default value
🔧 `configuru.features.highlightUnsafeDefaultValues`

If your `config.ts` file contains a hidden variable that is not an empty string or is not prefixed and suffixed with double underscores in `.env.jsonc`, the extension will underline it as a warning.
![Example](./resources/unsafe_default_value_for_hidden_secret_warning.jpeg)

**Enjoy!**
