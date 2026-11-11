# Emberfall Forge

코드만으로 만든 1인칭 대장간 장면(모루 망치질). 3D 모델·이미지·소리 파일 없이
three.js와 직접 쓴 셰이더로 화면과 소리를 실행 중에 만든다.

## 실행

```bash
npm install
```

```bash
npm run build
```

`dist/forge.html` 하나가 결과물이다(three.js 포함, 외부 요청 없음). 브라우저에서 바로 열면 된다.

같이 만들어지는 `dist/forge-artifact.html`은 claude.ai 아티팩트 게시용이다(문서 뼈대 없이 내용만).

개발 중에는 `npm run dev` 후 `http://localhost:5183` (새로고침마다 최신 소스 반영).
`/dist`는 배포용 번들, `/artifact`는 게시용 파일을 그대로 보여 준다.

## 조작

- 마우스: 시선 / 클릭: 망치질(모루를 보는 지점을 친다)
- R: 다시 달구기 / N: 새 쇳덩이 / Esc: 멈춤

## 구조

- `src/gfx/pipeline.js` 후처리(HDR, AO, 볼류메트릭 빛줄기, 블룸, 톤매핑·색보정, FXAA·그레인)
- `src/tex/` 절차적 재질: GLSL로 표면을 정의하고 GPU에서 텍스처로 굽는다
- `src/geo/builder.js` 지오메트리 도구(모서리 깎은 상자, 자동 UV, 재질별 병합)
- `src/world/` 방·화덕·모루·소품·손·칼날, `src/fx/` 불·불꽃·먼지, `src/audio/` 효과음 합성
- `src/game/forging.js` 망치질 진행, `src/ui/hud.js` 화면 안내

## 점검용 주소 옵션

`?play`(시작 화면 생략) `?view=wide|hands|up|back…` `?debug=ao|vol|bloom|depth` `?off=ao,vol,bloom,fxaa,grain`
