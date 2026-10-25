import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scanSecretLikeText } from '../src/core/privacy.js';

// Obviously fake values shaped like real credentials. None is a working secret.
const fake = (...parts: string[]) => parts.join('');

const MUST_REFUSE: Array<[string, string]> = [
  ['JSON_WEB_TOKEN', fake('Token eyJhbGciOiJIUzI1NiJ9', '.eyJzdWIiOiJmYWtlLXVzZXIifQ', '.ZmFrZS1zaWduYXR1cmUtdmFsdWU')],
  ['BEARER_TOKEN', fake('Authorization: Bearer ', 'FAKEtokenFAKEtokenFAKEtoken0000')],
  ['URL_CREDENTIALS', fake('DATABASE_URL=postgres://admin:', 'NotARealPass', '@db.example.invalid:5432/app')],
  ['SLACK_TOKEN', fake('https://hooks.slack.com/services/', 'T00000000/B00000000/', 'FAKEFAKEFAKEFAKE')],
  ['SLACK_TOKEN', fake('xoxb-', '000000000000-FAKEFAKEFAKE')],
  ['STRIPE_KEY', fake('sk_', 'live_', 'FAKEFAKEFAKEFAKE0000')],
  ['GOOGLE_API_KEY', fake('AIza', 'FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE000')],
];

const MUST_ALLOW = [
  'The password reset flow sends a magic link by email.',
  'API keys are loaded from the STRIPE_SECRET_KEY environment variable.',
  'Use the token bucket algorithm for rate limiting.',
  'Use Bearer authentication for internal calls.',
  'Connect with postgres://localhost:5432/app in development.',
  'Use git@github.com:org/repo.git as the remote.',
  'Email the team at dev@example.com about outages.',
  'Stripe test mode is enabled in staging.',
  'Tokens look like eyJ... and must never be logged.',
  'The commit 3f9a2c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39 introduced the regression.',
];

describe('Secret detection: common credential shapes', () => {
  for (const [pattern, text] of MUST_REFUSE) {
    it(`refuses ${pattern}`, () => {
      const result = scanSecretLikeText([text]);
      assert.equal(result.secretLike, true);
      assert.ok(result.patternIds.includes(pattern), result.patternIds.join(','));
    });
  }
  it('still accepts ordinary engineering statements', () => {
    for (const text of MUST_ALLOW) assert.equal(scanSecretLikeText([text]).secretLike, false, text);
  });
});
