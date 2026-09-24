// Where TanStack Start writes the client build (its default). This does not set it.
// Its own module because client code imports it, and importing vite.config.ts would break that.
export const OUT_DIR = 'dist/client'
