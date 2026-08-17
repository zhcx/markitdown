import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [assetDirectoryArgument, version, outputArgument] = process.argv.slice(2);
if (!assetDirectoryArgument || !version || !outputArgument) {
  throw new Error('Usage: node generate-converter-manifest.mjs <asset-directory> <version> <output-directory>');
}

const assetDirectory = resolve(assetDirectoryArgument);
const outputDirectory = resolve(outputArgument);
const prefix = `zeditor-converter-v${version}-`;
const files = (await readdir(assetDirectory))
  .filter((name) => name.startsWith(prefix) && name.endsWith('.zip'))
  .sort();
if (files.length !== 4) {
  throw new Error(`Expected four converter archives, found ${files.length}.`);
}

const artifacts = [];
for (const name of files) {
  const target = name.slice(prefix.length, -'.zip'.length);
  const path = resolve(assetDirectory, name);
  const bytes = await readFile(path);
  artifacts.push({
    target,
    url: `https://github.com/zhcx/markitdown/releases/download/converter-v${version}/${name}`,
    size: (await stat(path)).size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

const manifest = {
  schema_version: 1,
  module_id: 'document-converter',
  engine: 'anydoc',
  version,
  protocol_version: 1,
  minimum_app_version: '0.3.7',
  artifacts,
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDirectory, 'converter-manifest.json'), manifestBytes);

// 签名可选：有 CONVERTER_SIGNING_PRIVATE_KEY 时生成 manifest.sig，否则跳过
const encodedPrivateKey = process.env.CONVERTER_SIGNING_PRIVATE_KEY?.trim();
if (encodedPrivateKey) {
  const privateKey = createPrivateKey({
    key: Buffer.from(encodedPrivateKey, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, manifestBytes, privateKey).toString('base64');
  await writeFile(resolve(outputDirectory, 'converter-manifest.sig'), `${signature}\n`, 'utf8');
}
