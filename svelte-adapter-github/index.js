import path from 'path';
import { writeFileSync } from 'fs';
import { platforms } from './platforms.js';

/** @type {import('.').default} */
export default function (options) {
	return {
		name: 'svelte-adapter-github',

		async adapt(builder) {
			if (!options?.fallback) {
				/** @type {string[]} */
				const dynamic_routes = [];

				// this is a bit of a hack — it allows us to know whether there are dynamic
				// (i.e. prerender = false/'auto') routes without having dedicated API
				// surface area for it
				builder.createEntries((route) => {
					dynamic_routes.push(route.id);

					return {
						id: '',
						filter: () => false,
						complete: () => {}
					};
				});

				if (dynamic_routes.length > 0) {
					const prefix = path.relative('.', builder.config.kit.files.routes);
					builder.log.error(
						`svelte-adapter-github: all routes must be fully prerenderable (unless using the 'fallback' option — see https://github.com/malynium/svelte-adapter-github#spa-mode). Try adding \`export const prerender = true\` to your root layout.js — see https://kit.svelte.dev/docs/page-options#prerender for more details`
					);
					builder.log.error(
						dynamic_routes.map((id) => `  - ${path.posix.join(prefix, id)}`).join('\n')
					);
					throw new Error('Encountered dynamic routes');
				}
			}

			const platform = platforms.find((platform) => platform.test());

			if (platform) {
				if (options) {
					builder.log.warn(
						`Detected ${platform.name}. Please remove svelte-adapter-github options to enable zero-config mode`
					);
				} else {
					builder.log.info(`Detected ${platform.name}, using zero-config mode`);
				}
			}

			const {
				pages = 'docs',
				assets = pages,
				fallback,
				precompress,
				domain = '',
				jekyll = false
			} = options ??
			platform?.defaults(builder.config) ??
			/** @type {import('./index').AdapterOptions} */ ({});

			builder.rimraf(assets);
			builder.rimraf(pages);

			builder.writeClient(assets);
			builder.writePrerendered(pages, { fallback });

			if (!jekyll) writeFileSync(`${pages}/.nojekyll`,``);
      if (domain) writeFileSync(`${pages}/CNAME`,`${domain}`);

			if (precompress) {
				builder.log.minor('Compressing assets and pages');
				if (pages === assets) {
					await builder.compress(assets);
				} else {
					await Promise.all([builder.compress(assets), builder.compress(pages)]);
				}
			}

			if (pages === assets) {
				builder.log(`Wrote site to "${pages}"`);
			} else {
				builder.log(`Wrote pages to "${pages}" and assets to "${assets}"`);
			}

			if (!options) platform?.done(builder);
		}
	};
}
