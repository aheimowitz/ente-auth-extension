import path from "node:path";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        include: ["src/**/*.test.ts"],
    },
    resolve: {
        alias: {
            "@shared": path.resolve(root, "src/shared"),
        },
    },
});
