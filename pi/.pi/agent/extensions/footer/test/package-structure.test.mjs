import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const packageJsonPath = path.join(packageDir, 'package.json');
const indexPath = path.join(packageDir, 'src/index.ts');
const adapterPath = path.join(packageDir, 'src/subscription-usage-adapter.ts');
const usageCoreIfUiPath = path.join(packageDir, 'src/subscription-usage-core-if-ui.ts');
const usageCorePath = path.join(packageDir, 'src/subscription-usage/core/index.ts');
const usageFormatterPath = path.join(packageDir, 'src/subscription-usage/bar/src/formatting.ts');
const usageSharedPath = path.join(packageDir, 'src/subscription-usage/shared.ts');
const adoptedLicensePath = path.join(packageDir, 'LICENSE.pi-sub');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('footer extension owns its UI-gated subscription usage implementation', () => {
  assert.ok(fs.existsSync(packageJsonPath), `missing ${packageJsonPath}`);
  const pkg = readJson(packageJsonPath);

  assert.equal(pkg.name, 'pi-footer-extension');
  assert.equal(pkg.type, 'module');
  assert.deepEqual(pkg.dependencies, { typebox: '^1.1.24' });
  assert.deepEqual(pkg.pi.extensions, [
    './src/index.ts',
    './src/subscription-usage-core-if-ui.ts',
  ]);
  for (const requiredPath of [
    usageCoreIfUiPath,
    usageCorePath,
    usageFormatterPath,
    usageSharedPath,
    adoptedLicensePath,
  ]) {
    assert.ok(fs.existsSync(requiredPath), `missing ${requiredPath}`);
  }
});

test('footer extension isolates adopted usage formatting behind a local adapter', () => {
  assert.ok(fs.existsSync(indexPath), `missing ${indexPath}`);
  assert.ok(fs.existsSync(adapterPath), `missing ${adapterPath}`);

  const indexSource = fs.readFileSync(indexPath, 'utf8');
  const adapterSource = fs.readFileSync(adapterPath, 'utf8');

  assert.match(indexSource, /from "\.\/subscription-usage-adapter\.ts"/);
  assert.doesNotMatch(indexSource, /@marckrenn\/pi-sub/);
  assert.match(adapterSource, /\.\/subscription-usage\/bar\/src\/formatting\.ts/);
  assert.match(adapterSource, /\.\/subscription-usage\/bar\/src\/settings\.ts/);
});
