import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const packageDir = path.resolve('pi/.pi/agent/extensions/footer');
const packageJsonPath = path.join(packageDir, 'package.json');
const indexPath = path.join(packageDir, 'src/index.ts');
const adapterPath = path.join(packageDir, 'src/subbar-adapter.ts');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('footer extension is packaged and loads sub-core without loading sub-bar widget', () => {
  assert.ok(fs.existsSync(packageJsonPath), `missing ${packageJsonPath}`);
  const pkg = readJson(packageJsonPath);

  assert.equal(pkg.name, 'pi-footer-extension');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.dependencies['@marckrenn/pi-sub-bar'], '^1.3.0');
  assert.deepEqual(pkg.pi.extensions, [
    './src/index.ts',
    './node_modules/@marckrenn/pi-sub-core/index.ts',
  ]);
});

test('footer extension isolates sub-bar imports behind a local adapter', () => {
  assert.ok(fs.existsSync(indexPath), `missing ${indexPath}`);
  assert.ok(fs.existsSync(adapterPath), `missing ${adapterPath}`);

  const indexSource = fs.readFileSync(indexPath, 'utf8');
  const adapterSource = fs.readFileSync(adapterPath, 'utf8');

  assert.match(indexSource, /from "\.\/subbar-adapter\.ts"/);
  assert.doesNotMatch(indexSource, /@marckrenn\/pi-sub-bar\/src\//);
  assert.match(adapterSource, /@marckrenn\/pi-sub-bar\/src\/formatting\.ts/);
  assert.match(adapterSource, /@marckrenn\/pi-sub-bar\/src\/settings\.ts/);
});
