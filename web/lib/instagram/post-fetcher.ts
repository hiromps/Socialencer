import * as requestPromise from 'request-promise';
import { IgApiClient } from 'instagram-private-api';
import { SessionData, DashboardPost, WebSession } from './types';
import { extractPostsFromProfileHtml } from './post-extractor';
import { ClientMessageError } from './errors';

const WEB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchDashboardPosts(sessionData: SessionData): Promise<DashboardPost[]> {
  // 1) Try mobile API with patched constants
  if (sessionData.igState && sessionData.profile.id) {
    try {
      return await fetchUserPostsFromIgState(sessionData.igState, sessionData.profile.id);
    } catch (error: any) {
      console.warn('[posts] Mobile API failed:', error?.message);
    }
  }

  // 2) Try web API endpoint with proper headers
  if (sessionData.web) {
    try {
      return await fetchUserPostsFromWebApi(sessionData.web, sessionData.profile.id);
    } catch (error: any) {
      console.warn('[posts] Web API failed:', error?.message);
    }
  }

  // 3) Try profile-page HTML extraction (may no longer work with React SPA)
  if (sessionData.web) {
    const posts = await fetchUserPostsFromWebHtml(sessionData.web, sessionData.profile.username);
    if (posts.length) return posts;
  }

  throw new ClientMessageError(
    'No session is available for loading posts. Please log in again.',
  );
}

/**
 * Mobile API path — patches outdated constants at runtime so the
 * User-Agent isn't rejected by Instagram.
 */
async function fetchUserPostsFromIgState(
  igState: Record<string, unknown>,
  userId: string,
): Promise<DashboardPost[]> {
  const ig = new IgApiClient();
  ig.state.proxyUrl = process.env.IG_PROXY || '';
  await ig.state.deserialize(igState);

  // Patch constants to a 2025-era Instagram Android version.
  // The npm package ships with v222 which is rejected.
  patchIgConstants(ig);

  const feed = ig.feed.user(userId);
  const items = await feed.items();
  return items.slice(0, 12).map(toDashboardPostFromFeed);
}

/**
 * Web API path — uses www.instagram.com's own JSON endpoint with
 * the authenticated web session cookies and a browser User-Agent.
 */
async function fetchUserPostsFromWebApi(
  web: WebSession,
  userId: string,
): Promise<DashboardPost[]> {
  const jar = requestPromise.jar();
  if (web.jarJson?.cookies) {
    web.jarJson.cookies.forEach((c: any) => {
      jar.setCookie(`${c.key}=${c.value}`, 'https://www.instagram.com');
    });
  }

  const rp = requestPromise.defaults({
    headers: {
      'User-Agent': WEB_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
    },
    jar,
    gzip: true,
    json: true,
    simple: false,
    resolveWithFullResponse: true,
  });

  console.log('[posts] Web API: fetching /api/v1/feed/user/', userId);
  const res = await rp({
    url: `https://www.instagram.com/api/v1/feed/user/${userId}/?count=12`,
    headers: {
      'X-CSRFToken': web.csrftoken,
      'X-Instagram-AJAX': '1',
      'X-Requested-With': 'XMLHttpRequest',
      'X-IG-App-ID': '936619743392459',
      Referer: 'https://www.instagram.com/',
    },
  });

  console.log('[posts] Web API status:', res.statusCode);
  const items = res.body?.items || [];
  console.log('[posts] Web API returned', items.length, 'posts');

  if (!items.length && res.body) {
    console.log('[posts] Web API response keys:', Object.keys(res.body).join(', '));
  }

  return items.slice(0, 12).map(toDashboardPostFromFeed);
}

/**
 * Runtime patch for outdated instagram-private-api constants.
 * The npm package v1.46.1 uses APP_VERSION 222.0.0.13.114
 * which Instagram rejects with "useragent mismatch".
 */
function patchIgConstants(ig: IgApiClient) {
  const c = ig.state.constants as Record<string, string>;
  c.APP_VERSION = '350.1.0.42.92';
  c.APP_VERSION_CODE = '389531634';
  c.SIGNATURE_KEY = 'b03e0daaf422f5c2b05825e67a0bace5b99e62a55738b80c19e2215cd12bb655';
}

async function fetchUserPostsFromWebHtml(
  web: WebSession,
  username: string,
): Promise<DashboardPost[]> {
  const jar = requestPromise.jar();
  if (web.jarJson && web.jarJson.cookies) {
    web.jarJson.cookies.forEach((c: any) => {
      jar.setCookie(`${c.key}=${c.value}`, 'https://www.instagram.com');
    });
  }

  const baseUrl = 'https://www.instagram.com';
  const rp = requestPromise.defaults({
    headers: {
      'User-Agent': WEB_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    jar,
    gzip: true,
    simple: false,
    resolveWithFullResponse: true,
  });

  console.log('[posts] Fetching profile page for posts:', username);
  const profileRes = await rp({
    url: `${baseUrl}/${encodeURIComponent(username)}/`,
    headers: {
      'X-CSRFToken': web.csrftoken,
      'X-Instagram-AJAX': '1',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${baseUrl}/`,
    },
  });

  console.log('[posts] Profile page status:', profileRes.statusCode);
  const html: string = profileRes.body;

  if (profileRes.statusCode !== 200) {
    console.warn('[posts] Profile page returned', profileRes.statusCode);
    return [];
  }

  // Debug: check if we're actually logged in on the web side
  const hasLoginLink = html.includes('"login"') || html.includes('log in');
  const hasLogoutLink = html.includes('log out') || html.includes('logout');
  console.log('[posts] Auth check — has login link:', hasLoginLink, ', has logout link:', hasLogoutLink);

  // Try multiple marker patterns that Instagram has used over time
  const markers = [
    '"edge_owner_to_timeline_media":',
    '"xdt_api__v1__feed__user_timeline_graphql_connection":',
    '"user":{"edge_owner_to_timeline_media"',
    '"edges":',
    '"shortcode":"',
  ];
  for (const m of markers) {
    console.log('[posts] Marker "%s" found at index:', m, html.indexOf(m));
  }

  const posts = extractPostsFromProfileHtml(html);
  console.log('[posts] Extracted', posts.length, 'posts from profile page HTML');

  if (!posts.length) {
    // Log a bigger HTML chunk to see what we're working with
    console.log('[posts] HTML (first 1000 chars):', html.slice(0, 1000));
    console.log('[posts] HTML (last 500 chars):', html.slice(-500));
  }

  return posts.slice(0, 12);
}

// Local re-export so post-extractor's toDashboardPost is not used directly
// from API-facing contexts — the fetchers normalize via this wrapper.
import { toDashboardPost } from './post-extractor';
const toDashboardPostFromFeed = toDashboardPost;
