import { generateKeyPairSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve(process.argv[2] || '.converter-keys');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' });
const publicDer = publicKey.export({ format: 'der', type: 'spki' });
const rawPublicKey = publicDer.subarray(publicDer.length - 32);

await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, 'private-key.base64'), `${privateDer.toString('base64')}\n`, { mode: 0o600 });
await writeFile(resolve(outputDirectory, 'public-key.base64'), `${rawPublicKey.toString('base64')}\n`, { mode: 0o644 });
console.log(`Generated converter signing keys in ${outputDirectory}. Keep private-key.base64 secret and never commit it.`);
