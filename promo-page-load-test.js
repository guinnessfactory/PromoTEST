/**
 * Hmall 기획전 페이지 부하 테스트 (k6) — 불규칙 RPS 버전
 *
 * 프로모션 시작 전 서버 상태를 점검할 목적으로,
 * "특정 시간 패턴 없이" 요청이 불규칙하게 흩어지도록 만든 버전입니다.
 *   - 초당 요청 수(RPS)를 짧은 구간마다 무작위로 바꿔서 타이밍을 불규칙화
 *   - 출발지 IP는 1개 고정 (인프라팀 협의 완료)
 *
 * ⚠️ 반드시 인프라팀/보안팀과 사전 협의 후, 협의된 시간대에 실행하세요.
 *
 * 사용법:
 *   1) k6 설치: https://k6.io/docs/get-started/installation/
 *   2) 아래 CONFIG의 TARGET_URL을 실제 점검 대상(stg 기획전) URL로 수정
 *   3) 실행: k6 run promo-page-load-test.js
 *
 * 조정 포인트(상단 상수):
 *   RPS_MIN / RPS_MAX  구간별 목표 RPS의 최소~최대 (불규칙 폭)
 *   SEGMENT_SEC        RPS가 새로 뽑히는 간격(초). 작을수록 더 자주 튐
 *   TOTAL_MINUTES      전체 테스트 시간(분)
 *
 * 결과 지표: 응답시간(p95/p99), 실패율, 초당 요청수(RPS) 등이 콘솔에 출력됩니다.
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

// ===================== 설정 (필요에 맞게 수정) =====================
const TARGET_URL = 'https://hdev.hmall.com/md/pda/itemPtc?slitmCd=2130717889'; // 실제 기획전 URL로 교체

// ---- 불규칙 RPS 설정 ----
// 전체 요청 타이밍을 불규칙하게 만들기 위해, 짧은 구간(SEGMENT)마다
// 목표 RPS(초당 요청 수)를 아래 범위 안에서 무작위로 바꿉니다.
// 그 결과 초당 요청 수가 매 구간 들쭉날쭉해집니다.
const RPS_MIN = 10;          // 구간별 최소 목표 RPS
const RPS_MAX = 50;         // 구간별 최대 목표 RPS (상한)
const SEGMENT_SEC = 20;     // 한 구간 길이(초) - 이 간격마다 RPS가 새로 뽑힘
const TOTAL_MINUTES = 5;   // 전체 테스트 시간(분)
const PRE_ALLOCATED_VUS = 50; // 미리 확보할 VU 수 (아래 설명 참고)
const MAX_VUS = 100;           // 필요 시 최대로 늘릴 VU 수

// 전체 시간을 SEGMENT_SEC 단위로 쪼개고, 각 구간의 목표 RPS를 무작위로 채웁니다.
// k6는 stages의 target까지 "선형으로" 변하므로, 같은 값을 duration 0s로 한 번 더
// 찍어주면 구간 내내 그 값을 유지하다가 다음 구간에서 계단식으로 튀도록 만들 수 있습니다.
function buildIrregularStages() {
  const totalSegments = Math.floor((TOTAL_MINUTES * 60) / SEGMENT_SEC);
  const stages = [];
  for (let i = 0; i < totalSegments; i++) {
    const rps = Math.floor(Math.random() * (RPS_MAX - RPS_MIN + 1)) + RPS_MIN;
    // 계단식(급변) 패턴: 목표에 즉시 도달(0s) → 구간 동안 유지(SEGMENT_SEC)
    stages.push({ target: rps, duration: '0s' });
    stages.push({ target: rps, duration: `${SEGMENT_SEC}s` });
  }
  return stages;
}

// 디바이스/브라우저 다양화를 위한 User-Agent 목록 (실제 요청 패턴에 가깝게)
// Hmall은 모바일 트래픽 비중이 높아 모바일(삼성/아이폰) 항목을 넉넉히 넣었습니다.
// 실제 트래픽 분포에 더 가깝게 맞추고 싶으면, 아래에서 원하는 항목을 여러 번
// 중복해서 넣으면 그 비중만큼 더 자주 선택됩니다.
const USER_AGENTS = [
  // ===== PC - Chrome (Windows) =====
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',

  // ===== PC - Edge (Windows) =====
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',

  // ===== PC - Whale (네이버 웨일, 국내 사용 많음) =====
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Whale/3.25.232.19 Safari/537.36',

  // ===== PC - Firefox (Windows) =====
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',

  // ===== PC - Chrome / Safari (macOS) =====
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',

  // ===== Mobile - Android Chrome (삼성 갤럭시 계열) =====
  'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36', // S24 Ultra
  'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36', // S23
  'Mozilla/5.0 (Linux; Android 13; SM-S906N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36', // S22+
  'Mozilla/5.0 (Linux; Android 14; SM-F946N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36', // Z Fold5
  'Mozilla/5.0 (Linux; Android 13; SM-A536N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36', // A53 (보급형)

  // ===== Mobile - Android Samsung Internet (삼성 브라우저, 국내 매우 많음) =====
  'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',

  // ===== Mobile - iPhone Safari =====
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', // iOS 17
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1', // iOS 16

  // ===== Mobile - iPhone Chrome (iOS 크롬) =====
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1',

  // ===== Tablet - iPad =====
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',

  // ===== Tablet - Galaxy Tab =====
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

// 부하 패턴: ramping-arrival-rate
// VU 수가 아니라 "초당 요청 수(RPS)"를 직접 제어합니다.
// buildIrregularStages()가 만든 무작위 목표 RPS를 따라가므로,
// 전체 요청 타이밍이 특정 주기 없이 불규칙하게 흩어집니다.
export const options = {
  scenarios: {
    irregular_arrival: {
      executor: 'ramping-arrival-rate',
      startRate: RPS_MIN,       // 시작 RPS
      timeUnit: '1s',           // target 값을 "초당" 요청 수로 해석
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
      stages: buildIrregularStages(),
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95%의 응답이 3초 이내여야 통과
    http_req_failed: ['rate<0.05'],    // 실패율 5% 미만이어야 통과
  },
};

const failCounter = new Counter('custom_failures');

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 실행 시작 시 한 번만 호출되어 설정 요약을 출력합니다.
export function setup() {
  console.log('========================================');
  console.log('  Hmall 기획전 부하 테스트 (불규칙 RPS)');
  console.log('========================================');
  console.log(`  대상 URL     : ${TARGET_URL}`);
  console.log(`  RPS 범위     : ${RPS_MIN} ~ ${RPS_MAX} 건/초 (구간마다 무작위)`);
  console.log(`  구간 길이    : ${SEGMENT_SEC}초마다 RPS 변경`);
  console.log(`  전체 시간    : ${TOTAL_MINUTES}분`);
  console.log('========================================');

  // TARGET_URL이 운영(www)인지 가볍게 경고
  if (TARGET_URL.includes('www.hmall.com')) {
    console.warn('⚠ 대상이 운영(www)입니다. stg 점검이 목적이면 URL을 hstg로 바꾸세요.');
  }
}

export default function () {
  const res = http.get(TARGET_URL, {
    headers: {
      'User-Agent': randomUserAgent(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    tags: { name: 'promo_page' },
  });

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 5s': (r) => r.timings.duration < 5000,
  });

  if (!ok) {
    failCounter.add(1);
  }

  // arrival-rate 방식에서는 k6가 목표 RPS에 맞춰 요청 타이밍을 스스로 조절하므로
  // 여기서 sleep을 넣지 않습니다. (넣으면 오히려 목표 RPS를 못 맞춥니다)
}
