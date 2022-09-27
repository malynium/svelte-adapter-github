import { writeFileSync } from 'fs';
import { posix } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

/** @type {import('.').default} */
export default function () {
	// TODO remove for 1.0
	if (arguments.length > 0) {
		throw new Error(
			'esbuild options can no longer be passed to adapter-cloudflare — see https://github.com/sveltejs/kit/pull/4639'
		);
	}

	return {
		name: '@sveltejs/adapter-cloudflare',
		async adapt(builder) {
			const files = fileURLToPath(new URL('./files', import.meta.url).href);
			const dest = builder.getBuildDirectory('cloudflare');
			const tmp = builder.getBuildDirectory('cloudflare-tmp');

			builder.rimraf(dest);
			builder.rimraf(tmp);
			builder.mkdirp(tmp);

			const written_files = builder.writeClient(dest);
			builder.writePrerendered(dest);

			const relativePath = posix.relative(tmp, builder.getServerDirectory());

			builder.log.info(
				`adapter-cloudfare is writing its own _headers file. If you have your own, you should duplicate the headers contained in: ${dest}/_headers`
			);

			writeFileSync(
				`${tmp}/manifest.js`,
				`export const manifest = ${builder.generateManifest({ relativePath })};\n\n` +
					`export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});\n`
			);

			writeFileSync(
				`${dest}/_routes.json`,
				JSON.stringify(get_routes_json(builder.config.kit.appDir, written_files))
			);

			writeFileSync(`${dest}/_headers`, generate_headers(builder.config.kit.appDir));

			builder.copy(`${files}/worker.js`, `${tmp}/_worker.js`, {
				replace: {
					SERVER: `${relativePath}/index.js`,
					MANIFEST: './manifest.js'
				}
			});

			await esbuild.build({
				platform: 'browser',
				sourcemap: 'linked',
				target: 'es2020',
				entryPoints: [`${tmp}/_worker.js`],
				outfile: `${dest}/_worker.js`,
				allowOverwrite: true,
				format: 'esm',
				bundle: true
			});
		}
	};
}

/**
 * @param {string} app_dir
 * @param {string[]} assets
 * @returns {import('.').RoutesJSONSpec}
 */
function get_routes_json(app_dir, assets) {
	return {
		version: 1,
		description: 'Generated by @sveltejs/adapter-cloudflare',
		include: ['/*'],
		exclude: [
			`/${app_dir}/immutable/*`,
			...assets
				// We're being conservative by not excluding all assets in
				// /static just yet. If there are any upstream auth rules to
				// protect certain things (e.g. a PDF that requires auth),
				// then we wouldn't want to prevent those requests from going
				// to the user functions worker.
				// We do want to show an example of a _routes.json that
				// excludes more than just /_app/immutable/*, and favicons
				// are a reasonable choice
				.filter((file) => file.startsWith('favicon'))
				.map((file) => `/${file}`)
		]
	};
}

/** @param {string} app_dir */
function generate_headers(app_dir) {
	return `
# === START AUTOGENERATED SVELTE IMMUTABLE HEADERS ===
/${app_dir}/immutable/*
	Cache-Control: public, immutable, max-age=31536000
	X-Robots-Tag: noindex
# === END AUTOGENERATED SVELTE IMMUTABLE HEADERS ===
	`.trim();
}
