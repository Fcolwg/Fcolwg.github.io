# BO Lecture Simulator

Bayesian Optimization(BO)을 강의용으로 설명하고 실습하기 위한 정적 웹앱입니다.

이 저장소는 학생들이 별도 프로그램을 설치하지 않고 링크만으로 접속하는 방식을 기준으로 설계했습니다. GitHub Pages에 올리면 단일 앱인 `index.html`이 바로 서비스됩니다.

## 목표

- 교수자가 같은 화면으로 BO 흐름을 단계별 시연
- 학생은 같은 링크에서 개별 실습
- EI, PI, UCB, 사용자 정의 acquisition rule 비교
- 지정한 계산 횟수만큼 BO 진행
- iteration별 재생, 일시정지, 되감기
- sampling 방식과 BO 성능 비교
- 1D 직접 그리기 평가 대상 함수 f
- 1D GP posterior 시각화
- 1D, 2D, 3D 입력 문제를 교육용 시각화로 표현

## 현재 구조

```text
.
├─ index.html                 # 단일 BO 실습 앱
├─ design.html                # 앱 안에서 보는 설계 문서
├─ assets/
│  ├─ css/main.css
│  ├─ vendor/plotly-2.35.2.min.js
│  └─ js/
│     └─ app.bundle.js
├─ docs/
│  ├─ github-pages.md
│  └─ lecture-design.md
└─ .github/workflows/pages.yml
```

## 실행

가장 단순한 확인 방법은 `index.html`을 브라우저로 여는 것입니다.

Plotly도 `assets/vendor/`에 포함되어 있어 학생 PC에서 별도 설치나 CDN 접속이 필요하지 않습니다. 캐시 상태까지 확인하려면 폴더에서 간단한 로컬 서버를 열어 확인합니다.

```bash
python -m http.server 4173
```

그 다음 브라우저에서 아래 주소를 엽니다.

```text
http://localhost:4173
```

## GitHub Pages 배포

자세한 절차는 [docs/github-pages.md](docs/github-pages.md)를 참고하세요.
