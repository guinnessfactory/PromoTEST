# Promo Load Test

Hmall 프로모션/기획전 페이지를 대상으로 하는 k6 기반 부하 테스트 프로젝트입니다. 불규칙한 RPS 패턴을 적용해 실제 사용자 트래픽과 유사한 방식으로 페이지 성능을 점검합니다.

## 프로젝트 구성

- `promo-page-load-test.js`: k6 부하 테스트 스크립트
- `run_with_history.sh`: 테스트 실행 후 `result.json`에 실행 기록을 누적 저장
- `index.html`: GitHub Pages용 소개 페이지
- `result.json`: 최근 실행 결과 히스토리

## ⚠️ 사전 주의사항

- 인프라팀/보안팀과 사전 협의가 필요합니다.
- 테스트는 협의된 시간대에만 수행해야 합니다.
- 운영 환경 또는 외부 사용자가 많은 시간대는 피하는 것이 좋습니다.
- WAF / DDoS 방어 장비가 있는 경우, 테스트 소스 IP를 사전 허용해야 합니다.

## 로컬 실행

### 1) k6 설치

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates gnupg
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg

echo 'deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main' | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install -y k6
```

### 2) 테스트 URL 수정

`promo-page-load-test.js` 파일 상단의 `TARGET_URL` 값을 실제 점검 대상 URL로 바꿉니다.

### 3) 테스트 실행

```bash
k6 run promo-page-load-test.js
```

누적 결과 저장 방식으로 실행하려면:

```bash
chmod +x run_with_history.sh
./run_with_history.sh
```

## GitHub Pages 배포

정적 소개 페이지는 GitHub Pages에서 서빙할 수 있습니다.

1. GitHub 저장소 설정에서 Pages를 활성화합니다.
2. Source를 `Deploy from a branch` 또는 `GitHub Actions` 중 하나로 설정합니다.
3. 이 저장소의 `index.html` 파일이 정적 페이지로 노출됩니다.
4. `result.json` 파일을 `fetch()`로 읽어 화면에 최근 결과를 표시하도록 구성했습니다.

## GitHub Actions 자동 실행

`.github/workflows/promo-load-test.yml` 파일을 통해 다음 조건에서 자동 실행됩니다.

- `push` 이벤트
- `workflow_dispatch` 수동 실행
- 매일 정기 스케줄 실행

워크플로는:

1. k6 설치
2. 테스트 실행
3. `result.json` 누적 기록 추가
4. 변경 사항을 GitHub 저장소에 반영

## 결과 해석

- `http_req_duration`: 응답시간 분포
- `p(95)`: 상위 5% 응답시간
- `http_req_failed`: 실패율
- `iterations`: 총 요청 수

권장 기준:

- p95가 3초를 넘지 않아야 함
- 실패율 5% 미만 유지
- 서버가 갑작스런 피크 트래픽을 버텨야 함

## 파일 설명

- `promo-page-load-test.js`: 불규칙 RPS 기반 로드 테스트
- `run_with_history.sh`: 누적 JSON 히스토리 추가 스크립트
- `result.json`: 최근 테스트 결과 메타데이터 저장소
- `index.html`: GitHub Pages용 소개 및 결과 시각화 화면

## 추가 참고

로컬 PC에서 실제 부하량이 기대보다 낮을 수 있습니다. 이 경우 테스트 전용 서버 또는 클라우드 환경에서 분산 실행을 고려하는 것이 좋습니다.