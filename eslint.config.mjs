import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // App Router loads the shared font stylesheets in the root layout <head>,
      // not pages/_document. This rule targets the Pages Router, so it's a false
      // positive here — the CDN fonts (Pretendard, Noto Sans SC) are intentional.
      '@next/next/no-page-custom-font': 'off',
    },
  },
];

export default eslintConfig;
