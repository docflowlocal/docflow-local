# DocFlow plugins

This directory is the seed of the future `docflowlocal/plugins` repository.
The v1 API supports registration of data sources, transforms, formatters, and
output sinks. See [`transform-uppercase`](transform-uppercase/) for a minimal
transform and the
[plugin security guide](https://github.com/docflowlocal/docs/blob/main/plugin-security.md)
before loading any third-party plugin.

Plugins are trusted Node.js code. A manifest's `permissions` object communicates
intent to users and tooling, but does **not** sandbox the plugin. Installing a
plugin grants it the same operating-system access as the DocFlow process.
