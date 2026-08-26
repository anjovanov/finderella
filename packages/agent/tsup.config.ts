import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/cli.ts'],
	format: ['esm'],
	outDir: 'dist',
	clean: true,
	// The protocol package ships source TypeScript (bundled by Vite on the hub
	// side); plain Node can't import it, so inline it into the CLI bundle.
	noExternal: ['@finderella/protocol']
});
