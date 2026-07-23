import { createHash, createPrivateKey, sign } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const [executableArgument, version, target, outputArgument] = process.argv.slice(2);
if (!executableArgument || !version || !target || !outputArgument) {
  throw new Error('Usage: node prepare-converter-package.mjs <executable> <version> <target> <output-directory>');
}

const encodedPrivateKey = process.env.CONVERTER_SIGNING_PRIVATE_KEY?.trim();
if (!encodedPrivateKey) {
  throw new Error('CONVERTER_SIGNING_PRIVATE_KEY must contain a Base64 PKCS#8 Ed25519 private key.');
}

const executable = resolve(executableArgument);
const outputDirectory = resolve(outputArgument);
const executableName = basename(executable);
const executableBytes = await readFile(executable);
const metadata = {
  schema_version: 1,
  module_id: 'document-converter',
  version,
  protocol_version: 1,
  target,
  executable: executableName,
  executable_sha256: createHash('sha256').update(executableBytes).digest('hex'),
  supported_formats: ['pdf', 'docx', 'xlsx', 'pptx'],
};
const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
const privateKey = createPrivateKey({
  key: Buffer.from(encodedPrivateKey, 'base64'),
  format: 'der',
  type: 'pkcs8',
});
const signature = sign(null, metadataBytes, privateKey).toString('base64');

await mkdir(outputDirectory, { recursive: true });
await copyFile(executable, resolve(outputDirectory, executableName));
await writeFile(resolve(outputDirectory, 'module.json'), metadataBytes);
await writeFile(resolve(outputDirectory, 'module.sig'), `${signature}\n`, 'utf8');
