# GitHub Pages 배포 절차

이 프로젝트는 빌드가 필요 없는 정적 웹앱입니다. GitHub 저장소에 올린 뒤 Pages를 켜면 바로 링크로 배포할 수 있습니다.

## 권장 흐름

1. GitHub에서 새 저장소를 만듭니다.
2. `bo-lecture-app` 폴더 안의 파일을 저장소 루트에 올립니다.
3. 저장소의 `Settings > Pages`로 이동합니다.
4. `Build and deployment`에서 source를 `GitHub Actions`로 설정합니다.
5. `Actions` 탭에서 `Deploy static site to GitHub Pages` 실행 상태를 확인합니다.
6. 배포가 끝나면 Pages URL을 복사합니다.
7. 짧은 주소와 QR 코드를 만들어 강의자료 첫 페이지에 넣습니다.

## 링크 배포 방식

강의에서는 세 가지를 같이 쓰는 것을 권장합니다.

- LMS 공지에 Pages URL 게시
- 강의 슬라이드 첫 장과 마지막 장에 QR 코드 삽입
- 화면 상단 또는 하단에 짧은 주소 고정

예시:

```text
접속 주소: https://username.github.io/bo-lecture-app/
짧은 주소: https://bit.ly/bo-lecture
```

## 로컬 확인

브라우저에서 `index.html`을 바로 열어도 대부분 확인할 수 있습니다.

로컬 파일 실행에서 module 로딩 문제가 생기면 서버를 띄웁니다.

```bash
python -m http.server 4173
```

그리고 아래 주소로 접속합니다.

```text
http://localhost:4173
```

## Plotly 포함 정책

현재 preview 그래프는 `assets/vendor/plotly-2.35.2.min.js`를 사용합니다. 외부 CDN에 의존하지 않으므로 강의실 네트워크에서 CDN이 차단되어도 그래프가 표시됩니다.

GitHub Pages에 배포할 때 `assets/vendor/` 폴더를 저장소에 함께 올리면 됩니다.
