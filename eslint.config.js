import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'dev-dist', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // The simulation layer is pure TypeScript over numbers. That is what makes the
    // earthquake testable — see Implementation_Plan.md "Conventions that apply to every phase".
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*', '@react-three/*', '@dimforge/*'],
              message:
                'src/sim must stay pure TypeScript — it is the testable core. See Implementation_Plan.md.',
            },
          ],
        },
      ],
    },
  },
)
