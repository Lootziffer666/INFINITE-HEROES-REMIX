/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom gives us localStorage + DOM; fake-indexeddb (imported per-test)
    // provides IndexedDB for the storage round-trip tests.
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
