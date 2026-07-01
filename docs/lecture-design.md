# BO 강의용 앱 구조 설계

## 수업 운영 전제

- 교수자는 화면 공유로 시연합니다.
- 학생은 QR 코드 또는 짧은 링크로 접속합니다.
- 학생 PC에는 별도 설치가 필요하지 않습니다.
- GitHub Pages 같은 정적 호스팅으로 배포합니다.

## 화면 구분

### 단일 BO 실습 화면

- 1D, 2D, 3D 입력 차원 선택
- 수식 입력 또는 1D 직접 그리기 평가 대상 함수 f 선택
- EI, PI, UCB, 사용자 정의 획득함수 선택
- random, grid, LHS sampling과 같은 예산으로 비교
- 총 반복수 지정
- 현재 단계 슬라이더, 이전/다음, 자동 재생
- best value 비교 그래프
- 1D GP posterior 그래프
- 그래프 전체/확대/축소/크게 보기

## 계산 엔진 계획

```text
target function f or drawn 1D curve
        ↓
initial sampling
        ↓
exact GP posterior estimate
        ↓
acquisition rule
        ↓
next point selection
        ↓
history snapshot
        ↓
plot and replay
```

## 시각화 계획

- 1D: 평가 대상 함수 f, BO 관측점, sampling 관측점, 다음 후보점, GP posterior, 계산별 점수, best score
- 2D: contour/heatmap, BO 관측점, sampling 관측점, 다음 후보점
- 3D 입력: 3D scatter, z=0.5 slice view, BO/sampling 관측점, 다음 후보점

3D 입력 문제는 출력까지 포함하면 4차원입니다. 따라서 강의용 시각화는 slice view와 scatter를 기본으로 둡니다.

## 직접 그린 함수

1D에서는 학생 또는 교수자가 마우스로 선을 그리면 이를 보간해 `f(x)`로 사용합니다.

2D와 3D는 현재 수식 입력을 기본으로 사용합니다. 이후 grid 기반 heatmap 편집을 추가할 수 있습니다.

## 구현 우선순위

1. 1D BO 흐름 완성
2. EI, PI, UCB 계산 구현
3. GP posterior 시각화
4. iteration replay 구현
5. random, grid, LHS 비교
6. 직접 그린 1D 함수
7. 2D contour/surface
8. 3D slice view
9. 사용자 정의 획득함수 입력
