# Security

SearSuite is a TypeScript workspace for local development. Do not commit secrets, access tokens, private keys, production data exports or local `.env` files.

Report security issues privately to the project maintainers. Include the affected package, reproduction steps, expected impact and the smallest safe proof of concept.

Before publishing or deploying a host integration, run:

```bash
pnpm run verify
```

Security-sensitive platform behavior should live behind explicit adapters and DI contracts, not inside reusable domain or render packages.
