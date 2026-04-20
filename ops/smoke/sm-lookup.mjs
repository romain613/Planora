// Source map lookup for specific bundle positions.
import fs from 'node:fs';
import { SourceMapConsumer } from 'source-map';

const MAP_PATH = process.argv[2] || 'app/dist/assets/index-DBVezo2b.js.map';
const POSITIONS = [
  [173, 73066],
  [173, 73046],
  [172, 19269],
];

const raw = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const consumer = await new SourceMapConsumer(raw);

for (const [line, col] of POSITIONS) {
  const pos = consumer.originalPositionFor({ line, column: col });
  console.log(`\n=== bundle ${line}:${col} ===`);
  console.log(`  → ${pos.source}:${pos.line}:${pos.column}  (name=${pos.name || '?'})`);
  if (pos.source && !pos.source.startsWith('\0')) {
    // Get source content
    const content = consumer.sourceContentFor(pos.source, true);
    if (content) {
      const lines = content.split('\n');
      const startL = Math.max(1, pos.line - 2);
      const endL = Math.min(lines.length, pos.line + 2);
      for (let i = startL; i <= endL; i++) {
        const marker = i === pos.line ? '>>' : '  ';
        const line = lines[i - 1] || '';
        console.log(`  ${marker} ${i}: ${line.substring(0, 200)}`);
      }
    }
  }
}

consumer.destroy();
