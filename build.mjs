// forge-demo 빌드 스크립트
//   node build.mjs           -> dist/forge.html (three.js 포함 단일 HTML, 외부 요청 0건)
//   node build.mjs --serve   -> 개발 서버 (기본 포트 5183, 새로고침으로 최신 반영)
import * as esbuild from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const serve = process.argv.includes('--serve');
const portArg = process.argv.find((a) => a.startsWith('--port='));
const port = portArg ? Number(portArg.split('=')[1]) : 5183;

const options = {
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
};

async function page(minify, templateFile = 'src/index.html') {
  const result = await esbuild.build({ ...options, minify });
  const js = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
  const template = await readFile(join(root, templateFile), 'utf8');
  // 함수 치환: 번들 안의 `$&` 같은 패턴이 치환 문법으로 해석되지 않게 한다.
  return template.replace('<!--BUNDLE-->', () => `<script>${js}</script>`);
}

if (serve) {
  createServer(async (req, res) => {
    try {
      // /dist 는 배포용(압축) 번들을 그대로 돌려준다: 최종 파일 검증용
      const html = req.url.startsWith('/artifact') ? `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${await page(true, 'src/artifact.html')}` : req.url.startsWith('/dist') ? await page(true) : await page(false);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(String(err?.message ?? err));
    }
  }).listen(port, () => console.log(`forge-demo dev server: http://localhost:${port}`));
} else {
  const html = await page(true);
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'dist/forge.html'), html);
  console.log(`dist/forge.html ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
  // 아티팩트 게시용(문서 뼈대 없이 내용만): 게시 시 뼈대로 감싸진다.
  const frag = await page(true, 'src/artifact.html');
  await writeFile(join(root, 'dist/forge-artifact.html'), frag);
  console.log(`dist/forge-artifact.html ${(Buffer.byteLength(frag) / 1024).toFixed(0)} KB`);
}
