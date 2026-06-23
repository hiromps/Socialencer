import { IgApiClient } from 'instagram-private-api';

/**
 * instagram-private-api v1.46.1 ships with stale Android app constants.
 * Keep the runtime identity in one place so login and authenticated fetches
 * use the same User-Agent/signature values.
 */
export function applyIgRuntimeConfig(ig: IgApiClient) {
  const constants = ig.state.constants as Record<string, string>;
  constants.APP_VERSION = '350.1.0.42.92';
  constants.APP_VERSION_CODE = '389531634';
  constants.SIGNATURE_KEY =
    'b03e0daaf422f5c2b05825e67a0bace5b99e62a55738b80c19e2215cd12bb655';

  const proxyUrl = process.env.IG_PROXY?.trim();
  if (proxyUrl) {
    ig.state.proxyUrl = proxyUrl;
  }
}

export function createInstagramClient(seed?: string) {
  const ig = new IgApiClient();
  if (seed) {
    ig.state.generateDevice(seed);
  }
  applyIgRuntimeConfig(ig);
  return ig;
}
