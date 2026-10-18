// Generează src/prompts/bundle.ts din fișierele .md, ca runner-ul să nu citească de pe disc la rulare (Vercel, Deno).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname ?? '.', '..', 'src', 'prompts');
const names = ['main_coach', 'head_coach', 'format', 'fiziolog', 'antrenor_comun', 'antrenor_inot', 'antrenor_bicicleta', 'antrenor_alergare', 'antrenor_forta', 'antrenor_fitness', 'nutritionist', 'fizioterapeut', 'minte', 'ghid'] as const;
const parts = names.map((n) => `  ${n}: ${JSON.stringify(readFileSync(join(dir, `${n}.md`), 'utf8'))},`);
const out = `// GENERAT de scripts/bundle-prompts.ts din src/prompts/*.md — nu edita manual; rulează \`npm run prompts\`.\nimport type { Prompts } from '../agents/runner.js';\n\nexport const PROMPTS: Prompts = {\n${parts.join('\n')}\n};\n`;
writeFileSync(join(dir, 'bundle.ts'), out);
console.log(`bundle.ts: ${names.length} prompturi`);
