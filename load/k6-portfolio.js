import http from 'k6/http';
import { check, sleep } from 'k6';

const base = __ENV.API_URL || 'http://127.0.0.1:8000/api';

export const options = {
  scenarios: {
    browsing: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
      exec: 'browse',
    },
    contact_submissions: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 10,
      maxVUs: 20,
      exec: 'submitContact',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export function browse() {
  for (const endpoint of [
    '/settings',
    '/hero',
    '/projects',
    '/skills',
    '/testimonials',
  ]) {
    const response = http.get(`${base}${endpoint}`);
    check(response, {
      [`${endpoint} responds successfully`]: (r) => r.status === 200,
    });
  }
  sleep(1);
}

export function submitContact() {
  const response = http.post(
    `${base}/contact-messages`,
    JSON.stringify({
      name: `Load visitor ${__VU}`,
      email: `load-${__VU}-${__ITER}@example.test`,
      message: 'Local load-test submission.',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(response, { 'contact submission accepted': (r) => r.status === 201 });
}
