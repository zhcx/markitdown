import { createHash, createPrivateKey, sign } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const [executableArgument, version, target, outputArgument] = process.argv.slice(2);
if (!executableArgument || !version || !target || !outputArgument) {
  throw new Error('Usage: node prepare-converter-package.mjs <executable> <version> <target> <output-directory>');
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
  supported_formats: [
    'pdf', 'docx', 'pptx', 'xlsx', 'xls',
    'html', 'htm', 'xhtml', 'csv', 'json', 'jsonl', 'xml', 'rss', 'atom',
    'zip', 'epub', 'jpg', 'jpeg', 'png', 'wav', 'mp3', 'm4a', 'mp4',
    'msg', 'ipynb', 'txt', 'text', 'md', 'markdown',
  ],
};
const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

await mkdir(outputDirectory, { recursive: true });
await copyFile(executable, resolve(outputDirectory, executableName));
await writeFile(resolve(outputDirectory, 'module.json'), metadataBytes);

// 签名可选：有 CONVERTER_SIGNING_PRIVATE_KEY 时生成 module.sig，否则跳过
const encodedPrivateKey = process.env.CONVERTER_SIGNING_PRIVATE_KEY?.trim();
if (encodedPrivateKey) {
  const privateKey = createPrivateKey({
    key: Buffer.from(encodedPrivateKey, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, metadataBytes, privateKey).toString('base64');
  await writeFile(resolve(outputDirectory, 'module.sig'), `${signature}\n`, 'utf8');
}
