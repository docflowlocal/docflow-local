# @docflow-local/desktop-extension-sdk

This package defines the public feature-slot boundary between DocFlow Desktop
Community and optional trusted extensions such as DocFlow Pro.

Extensions register commands during activation. Every invocation is checked
again against the host's verified feature policy. Hiding a button in the
renderer is never treated as authorization.

Paid policy cannot be assigned directly. The host accepts only a successful,
process-local result from `@docflow-local/license-verifier` through
`setVerification()`. Calling code cannot unlock commercial commands with a
plain `{ features: [...] }` or `{ valid: true, policy: ... }` object.

Extensions execute in the Desktop main process and are therefore trusted code.
The manifest is a compatibility and entitlement contract, not a sandbox.
