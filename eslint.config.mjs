// @ts-check

import safeql from '@ts-safeql/eslint-plugin/config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	...tseslint.configs.recommendedTypeCheckedOnly,
	safeql.configs.connections({
		databaseUrl: 'postgresql://postgres@localhost:5432/reserv-keion?sslmode=disable',
		targets: [{ wrapper: 'pool.query' }],
	})
);
