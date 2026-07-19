import test from 'node:test';
import assert from 'node:assert/strict';
import { isTextFileName, resolveFileIcon } from '../src/utils/fileIcon.ts';

test('prioritizes well-known filenames over their extensions', () => {
  assert.deepEqual(resolveFileIcon('README.md'), { kind: 'readme', shape: 'book' });
  assert.deepEqual(resolveFileIcon('package.json'), { kind: 'npm', shape: 'package' });
  assert.deepEqual(resolveFileIcon('docker-compose.yml'), { kind: 'docker', shape: 'docker' });
  assert.deepEqual(resolveFileIcon('Cargo.lock'), { kind: 'cargo', shape: 'lock' });
});

test('distinguishes language variants and common document families', () => {
  assert.deepEqual(resolveFileIcon('Component.tsx'), { kind: 'react', shape: 'language', label: 'TSX' });
  assert.deepEqual(resolveFileIcon('main.cpp'), { kind: 'cpp', shape: 'language', label: 'C+' });
  assert.deepEqual(resolveFileIcon('slides.pptx'), { kind: 'slides', shape: 'office', label: 'P' });
  assert.deepEqual(resolveFileIcon('photo.webp'), { kind: 'image', shape: 'image' });
  assert.deepEqual(resolveFileIcon('data.sqlite3'), { kind: 'database', shape: 'database' });
});

test('handles dotfiles, paths, and unknown files safely', () => {
  assert.deepEqual(resolveFileIcon('.env.local'), { kind: 'env', shape: 'config' });
  assert.deepEqual(resolveFileIcon('src\\.gitignore'), { kind: 'git', shape: 'git' });
  assert.deepEqual(resolveFileIcon('/tmp/no-extension'), { kind: 'document', shape: 'document' });
});

test('recognizes source, config, and extensionless text files as directly readable', () => {
  for (const file of ['main.ts', 'Component.tsx', 'Cargo.toml', 'Dockerfile', '.gitignore', '.env.local', 'query.sql']) {
    assert.equal(isTextFileName(file), true, file);
  }
  for (const file of ['photo.png', 'document.pdf', 'archive.zip', 'program.exe']) {
    assert.equal(isTextFileName(file), false, file);
  }
});
