# Operations

## Serverless runtime

`/api/discover` runs on the Node.js runtime with a 60-second maximum duration. `ENVIO_API_TOKEN` is read only server-side and must be configured as a server runtime variable. Never prefix it with `NEXT_PUBLIC_`.

HyperSync results and the IP rate limiter are held in process memory. On serverless hosting, each instance has its own cache and request window, and both can reset when an instance is replaced. The route reads the client address from Vercel's `x-forwarded-for` header, using the first address in the list.

The discovery response always reports its covered range and whether HyperSync was capped or the RPC fallback was used. Treat partial coverage as a prompt to retry rather than as a full-history result.
