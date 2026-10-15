import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several 3D tests build and step the whole harbour in Node; CI runners
    // are a few times slower than a laptop, and 5s left too little headroom.
    testTimeout: 20_000,
  },
});
