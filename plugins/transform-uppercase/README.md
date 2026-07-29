# Uppercase selected fields

A minimal DocFlow plugin API v1 transform. It copies an input record, uppercases
configured string fields, and leaves the original object unchanged.

```js
const plugin = require("./plugins/transform-uppercase");

const transforms = new Map();
plugin.activate({
  registerTransform(name, transform) {
    transforms.set(name, transform);
  }
});

const uppercase = transforms.get("uppercase-fields");
const output = uppercase(
  { company: "Acme Demo", amount: 10 },
  { locale: "en-US", options: { fields: ["company"] } }
);
// => { company: "ACME DEMO", amount: 10 }
```

The manifest requests no filesystem or network access. Those declarations
document intent only; the plugin remains trusted in-process Node.js code and is
not sandboxed. Review the source and verify its package hash before use. See
the
[plugin security guide](https://github.com/docflowlocal/docs/blob/main/plugin-security.md).
