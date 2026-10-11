// Says whether the built app in build/ is out of date, so start.cmd only rebuilds when something changed.
// Exit code 1 means a build is needed; 0 means the build is current.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** When a file, or anything inside a folder, was last changed. 0 if it is not there. */
function lastChanged(target) {
	const stat = fs.statSync(target, { throwIfNoEntry: false });
	if (!stat) return 0;
	if (!stat.isDirectory()) return stat.mtimeMs;
	return Math.max(0, ...fs.readdirSync(target).map((name) => lastChanged(path.join(target, name))));
}

// Everything the build is made from.
const sources = ['src', 'static', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'components.json'];
const changed = Math.max(...sources.map((name) => lastChanged(path.join(root, name))));
const built = lastChanged(path.join(root, 'build', 'index.html'));
process.exit(built && built >= changed ? 0 : 1);
