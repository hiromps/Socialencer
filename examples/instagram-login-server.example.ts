/* tslint:disable:no-console */
import { randomBytes } from 'crypto';
import { createReadStream } from 'fs';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { normalize, resolve } from 'path';
import { URL } from 'url';
import * as requestPromise from 'request-promise';
import JSONbigIntFactory = require('json-bigint');
import {
  IgApiClient,
  IgLoginBadPasswordError,
  IgLoginInvalidUserError,
  IgLoginTwoFactorRequiredError,
  IgResponseError,
} from '../src';

const JSONbigString = JSONbigIntFactory({ storeAsString: true });

interface LoginRequestBody {
  username?: string;
  password?: string;
  verificationCode?: string;
  twoFactorIdentifier?: string;
  verificationMethod?: string;
  remember?: boolean;
}

interface SessionProfile {
  id: string;
  username: string;
  fullName: string;
  isPrivate: boolean;
  isVerified: boolean;
  profilePicUrl?: string;
  biography?: string;
  externalUrl?: string;
  loginAt: string;
}

interface WebSession {
  jarJson: any;
  csrftoken: string;
  userId: string;
}

interface DashboardPost {
  id: string;
  code: string;
  takenAt: number;
  caption: string;
  thumbnail: string;
  displayUrl: string;
  likeCount: number;
  commentCount: number;
  mediaType: number;
  carouselMedia: Array<{ thumbnail: string }>;
}

interface SessionData {
  profile: SessionProfile;
  igState?: any;
  web?: WebSession;
}

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const root = resolve(__dirname);
const WEB_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const sessionCookieName = 'socialencer_session';
const sessions = new Map<string, SessionData>();
const explicitInstagramProxy = process.env.IG_PROXY;

if (!explicitInstagramProxy) {
  clearAmbientProxyEnvironment();
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);

    if (request.method === 'POST' && url.pathname === '/api/instagram/login') {
      await handleLogin(request, response);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/dashboard/logout') {
      handleLogout(request, response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/dashboard/profile') {
      handleDashboardProfile(request, response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/dashboard/posts') {
      handleDashboardPosts(request, response);
      return;
    }

    if (request.method === 'GET') {
      serveStatic(url.pathname, response);
      return;
    }

    sendJson(response, 405, { message: 'Method not allowed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    sendJson(response, 500, { message });
  }
}).listen(port, host, () => {
  console.log(`Instagram login page: http://${host}:${port}/instagram-login-page.html`);
});

function clearAmbientProxyEnvironment() {
  ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'].forEach(name => {
    delete process.env[name];
  });
}

async function handleLogin(request: IncomingMessage, response: ServerResponse) {
  const body = await readJsonBody<LoginRequestBody>(request);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const verificationCode = String(body.verificationCode || '').trim();
  const twoFactorIdentifier = String(body.twoFactorIdentifier || '').trim();
  const verificationMethod = String(body.verificationMethod || '').trim() || '1';

  if (!username || !password) {
    sendJson(response, 400, { message: 'ユーザー名とパスワードを入力してください。' });
    return;
  }

  const ig = new IgApiClient();
  ig.state.generateDevice(username);
  ig.state.proxyUrl = explicitInstagramProxy;

  try {
    await ig.simulate.preLoginFlow();
    const user = twoFactorIdentifier
      ? await loginWithTwoFactor(ig, username, verificationCode, twoFactorIdentifier, verificationMethod, body.remember)
      : await ig.account.login(username, password);

    // postLoginFlow を先に完了させてセッションを完全に確立する
    try {
      await ig.simulate.postLoginFlow();
    } catch (error) {
      console.warn('postLoginFlow failed:', error instanceof Error ? error.message : error);
    }

    const { profile, webSession } = await buildSessionProfile(ig, user, password);
    const sessionId = createSession(profile, await ig.state.serialize(), webSession);

    sendJson(
      response,
      200,
      {
        message: `${profile.username} としてログインしました。`,
        redirectUrl: '/dashboard/profile.html',
        user: profile,
      },
      { 'Set-Cookie': buildSessionCookie(sessionId) },
    );
  } catch (error) {
    handleLoginError(error, response);
  }
}

function loginWithTwoFactor(
  ig: IgApiClient,
  username: string,
  verificationCode: string,
  twoFactorIdentifier: string,
  verificationMethod: string,
  remember?: boolean,
) {
  if (!verificationCode) {
    throw new ClientMessageError('2段階認証コードを入力してください。');
  }

  return ig.account.twoFactorLogin({
    username,
    verificationCode,
    twoFactorIdentifier,
    verificationMethod,
    trustThisDevice: remember === false ? '0' : '1',
  });
}

function handleDashboardProfile(request: IncomingMessage, response: ServerResponse) {
  const sessionData = getSession(request);
  if (!sessionData) {
    sendJson(response, 401, { message: 'ログインしてください。', redirectUrl: '/instagram-login-page.html' });
    return;
  }
  sendJson(response, 200, { profile: sessionData.profile });
}

function handleLogout(request: IncomingMessage, response: ServerResponse) {
  const sessionId = getSessionId(request);
  if (sessionId) {
    sessions.delete(sessionId);
  }

  sendJson(
    response,
    200,
    { message: 'ログアウトしました。', redirectUrl: '/instagram-login-page.html' },
    {
      'Set-Cookie': `${sessionCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    },
  );
}

async function handleDashboardPosts(request: IncomingMessage, response: ServerResponse) {
  const sessionData = getSession(request);
  if (!sessionData) {
    sendJson(response, 401, { message: 'Please log in.', redirectUrl: '/instagram-login-page.html' });
    return;
  }

  try {
    const posts = await fetchDashboardPosts(sessionData);
    sendJson(response, 200, { posts });
  } catch (error: any) {
    console.warn('[posts] Error:', error?.message);
    sendJson(response, 500, { message: 'Could not load posts.' });
  }
}

async function fetchDashboardPosts(sessionData: SessionData): Promise<DashboardPost[]> {
  if (sessionData.igState && sessionData.profile.id) {
    try {
      return await fetchUserPostsFromIgState(sessionData.igState, sessionData.profile.id);
    } catch (error: any) {
      console.warn('[posts] Mobile API failed:', error?.message);
    }
  }

  if (sessionData.web) {
    return fetchUserPostsFromWeb(sessionData.web, sessionData.profile.username);
  }

  throw new ClientMessageError('No session is available for loading posts. Please log in again.');
}

async function fetchUserPostsFromIgState(igState: any, userId: string): Promise<DashboardPost[]> {
  const ig = new IgApiClient();
  await ig.state.deserialize(igState);
  const feed = ig.feed.user(userId);
  const items = await feed.items();
  return items.slice(0, 12).map(toDashboardPost);
}

async function fetchUserPostsFromWeb(web: WebSession, username: string): Promise<DashboardPost[]> {
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

  // Extract posts from the profile page embedded JSON.
  // Instagram embeds the first batch of posts (edge_owner_to_timeline_media)
  // directly in the profile page HTML, which avoids mobile API version checks.
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

  const posts = extractPostsFromProfileHtml(html);
  console.log('[posts] Extracted', posts.length, 'posts from profile page HTML');

  // If nothing extracted, log a snippet for debugging
  if (!posts.length) {
    const snippet = html.slice(0, 500);
    console.log('[posts] HTML snippet:', snippet);
  }

  return posts.slice(0, 12);
}

/**
 * Extracts post data from an Instagram profile page's embedded JSON.
 *
 * Instagram profile pages embed a JSON object containing
 * `edge_owner_to_timeline_media` whose `edges[].node` records map to
 * individual posts. This function locates that JSON block in the raw HTML
 * via brace-counting (not regex), so it tolerates deeply nested structures.
 */
function extractPostsFromProfileHtml(html: string): DashboardPost[] {
  // Primary marker: traditional Instagram profile page embedded JSON.
  const mediaEdges = extractMediaEdges(html, '"edge_owner_to_timeline_media":');
  if (mediaEdges.length) return mediaEdges;

  // Fallback: newer Instagram frontends may embed media inside
  // <script type="application/json"> tags. Search all such blobs
  // for edges containing shortcodes.
  console.warn('[posts] Primary marker not found, trying script-tag fallback...');
  const scriptJsonPattern = /<script\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptJsonPattern.exec(html)) !== null) {
    try {
      const data = JSONbigIntParse(match[1]);
      const edges = findEdgesRecursive(data);
      if (edges.length) return edges;
    } catch {
      // skip unparseable script tag
    }
  }

  return [];
}

/**
 * Find edges from an embedded JSON blob identified by `marker` in `html`.
 * Uses brace-counting so it correctly handles deeply nested objects.
 */
function extractMediaEdges(html: string, marker: string): DashboardPost[] {
  const startIndex = html.indexOf(marker);
  if (startIndex === -1) return [];

  let pos = startIndex + marker.length;
  while (pos < html.length && /\s/.test(html[pos])) pos++;
  if (html[pos] !== '{') return [];

  const jsonStart = pos;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (; pos < html.length; pos++) {
    const ch = html[pos];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }

  const jsonStr = html.substring(jsonStart, pos + 1);
  let mediaData: any;
  try {
    mediaData = JSONbigIntParse(jsonStr);
  } catch (err: any) {
    console.warn('[posts] Failed to parse media JSON:', err?.message);
    return [];
  }

  const edges = mediaData?.edges || [];
  return edges.map((edge: any) => toDashboardPost(edge.node || edge));
}

/**
 * JSON.parse wrapper that falls back to JSONbigInt if the standard parser
 * encounters large integers (common in Instagram id fields).
 */
function JSONbigIntParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return JSONbigString.parse(text);
  }
}

/**
 * Walk a parsed JSON tree looking for an object with an `edges` array
 * whose entries contain `node.shortcode` — the telltale sign of Instagram
 * timeline media.
 */
function findEdgesRecursive(obj: any, depth: number = 0): DashboardPost[] {
  if (!obj || typeof obj !== 'object' || depth > 10) return [];
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findEdgesRecursive(item, depth + 1);
      if (result.length) return result;
    }
    return [];
  }
  // Check if this object has edges containing shortcode-bearing nodes
  if (Array.isArray(obj.edges)) {
    const hasShortcode = obj.edges.some(
      (e: any) => (e?.node?.shortcode || e?.node?.code || e?.shortcode),
    );
    if (hasShortcode) {
      return obj.edges.map((e: any) => toDashboardPost(e.node || e));
    }
  }
  // Recurse into object values
  for (const value of Object.values(obj)) {
    const result = findEdgesRecursive(value, depth + 1);
    if (result.length) return result;
  }
  return [];
}

function toDashboardPost(item: any): DashboardPost {
  // Normalize both mobile-API items and profile-page embedded nodes.
  const caption =
    item.caption?.text ||
    item.edge_media_to_caption?.edges?.[0]?.node?.text ||
    '';

  const candidates =
    item.image_versions2?.candidates ||
    item.image_versions?.candidates ||
    [];

  const displayUrl =
    candidates[0]?.url ||
    item.display_url ||
    item.displayUri ||
    '';

  const thumbnail =
    candidates.length > 1 ? candidates[1]?.url || candidates[0]?.url : candidates[0]?.url ||
    item.thumbnail_src ||
    item.display_url ||
    '';

  const likeCount =
    item.like_count ||
    item.likeCount ||
    item.edge_media_preview_like?.count ||
    item.edge_like?.count ||
    0;

  const commentCount =
    item.comment_count ||
    item.commentCount ||
    item.edge_media_to_comment?.count ||
    item.edge_media_preview_comment?.count ||
    0;

  const carouselMedia: Array<{ thumbnail: string }> = (
    item.carousel_media ||
    (item.edge_sidecar_to_children?.edges || []).map((e: any) => e.node)
  ).map((m: any) => ({
    thumbnail:
      m.image_versions2?.candidates?.[0]?.url ||
      m.image_versions?.candidates?.[0]?.url ||
      m.display_url ||
      '',
  }));

  return {
    id: item.id || '',
    code: item.code || item.shortcode || '',
    takenAt: item.taken_at || item.takenAt || item.taken_at_timestamp || 0,
    caption,
    thumbnail,
    displayUrl,
    likeCount,
    commentCount,
    mediaType: item.media_type || item.mediaType || 1,
    carouselMedia,
  };
}

function getSession(request: IncomingMessage): SessionData | undefined {
  const sessionId = getSessionId(request);
  return sessionId ? sessions.get(sessionId) : undefined;
}

async function buildSessionProfile(ig: IgApiClient, loginUser: any, password?: string): Promise<{ profile: SessionProfile; webSession?: WebSession }> {
  const { details, webSession } = await collectProfileDetails(ig, loginUser, password);
  const mergedProfile = details.reduceRight((profile, detail) => mergeProfile(profile, detail), loginUser || {});
  return { profile: toSessionProfile(mergedProfile), webSession };
}

async function collectProfileDetails(ig: IgApiClient, loginUser: any, password?: string): Promise<{ details: any[]; webSession?: WebSession }> {
  const details = [loginUser].filter(Boolean);
  let webSession: WebSession | undefined;

  const username = loginUser?.username;

  if (username) {
    const result = await fetchWebProfile(loginUser, username, password);
    if (result) {
      details.push(result.user);
      webSession = result.webSession;
    }
  }

  return { details, webSession };
}

async function fetchWebProfile(loginUser: any, username: string, password?: string): Promise<{ user: any; webSession: WebSession } | null> {
  // Use request-promise with its own cookie jar for web session
  const rp = requestPromise.defaults({
    headers: {
      'User-Agent': WEB_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/json,*/*',
    },
    gzip: true,
    followRedirect: true,
    simple: false,
    resolveWithFullResponse: true,
  });

  const jar = requestPromise.jar();
  const baseUrl = 'https://www.instagram.com';

  try {
    // Step 1: Get CSRF token from homepage cookies
    console.log('[web] Fetching homepage for CSRF token...');
    const homeRes = await rp({ url: baseUrl, jar });
    // Log response status and a snippet of the body
    console.log('[web] Homepage status:', homeRes.statusCode);
    console.log('[web] Homepage body snippet:', homeRes.body.slice(0, 200));
    // Get CSRF token from cookie jar
    const homeCookies = jar.getCookies(baseUrl);
    console.log('[web] Cookie keys:', homeCookies.map((c: any) => c.key).join(', '));
    const csrfCookie = homeCookies.find((c: any) => c.key === 'csrftoken');
    const csrftoken = csrfCookie ? csrfCookie.value : '';
    console.log('[web] CSRF token from cookie:', csrftoken ? csrftoken.slice(0, 10) + '...' : 'NOT FOUND');

    if (!csrftoken) {
      console.warn('[web] Could not get CSRF token from homepage cookies');
      return null;
    }

    // Step 2: Login to web API
    console.log('[web] Logging in to web API...');
    const encPassword = `#PWD_INSTAGRAM_BROWSER:0:${Date.now()}:${password || ''}`;
    const loginRes = await rp({
      url: `${baseUrl}/accounts/login/ajax/`,
      method: 'POST',
      jar,
      headers: {
        'X-CSRFToken': csrftoken,
        'X-Instagram-AJAX': '1',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${baseUrl}/`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      form: {
        username: loginUser.username || username,
        enc_password: encPassword,
        queryParams: '{}',
        optIntoOneTap: 'false',
        stopDeletionNonce: '',
        trustedDeviceRecords: '{}',
      },
    });
    console.log('[web] Login response status:', loginRes.statusCode);
    const loginBody = typeof loginRes.body === 'string' ? JSON.parse(loginRes.body) : loginRes.body;
    console.log('[web] Login body keys:', Object.keys(loginBody || {}).join(', '));
    console.log('[web] Login authenticated:', loginBody?.authenticated);

    if (!loginBody?.authenticated) {
      console.warn('[web] Web login failed:', loginBody?.message || JSON.stringify(loginBody).slice(0, 200));
      return null;
    }

    // Check login response user
    const webLoginUser = loginBody?.user;
    console.log('[web] Login user type:', typeof webLoginUser);
    console.log('[web] Login user value:', JSON.stringify(webLoginUser).slice(0, 300));

    // Step 3: Try the profile page directly (parse embedded JSON)
    console.log('[web] Fetching profile page...');
    const profilePageRes = await rp({
      url: `${baseUrl}/${username}/`,
      jar,
      headers: {
        'X-CSRFToken': csrftoken,
        'X-Instagram-AJAX': '1',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${baseUrl}/`,
      },
    });
    console.log('[web] Profile page status:', profilePageRes.statusCode);
    // Extract embedded JSON from profile page
    const body = profilePageRes.body;
    // Helper to decode JSON-escaped strings (handles \uXXXX, \n, \t, etc.)
    const jsonDecode = (raw: string) => {
      try {
        return JSON.parse(`"${raw}"`);
      } catch {
        return raw;
      }
    };

    let bio = '';
    let extUrl = '';
    let profilePic = '';
    let fullName = '';

    // Try meta tags
    const metaBio = body.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
    if (metaBio) {
      bio = jsonDecode(metaBio[1]);
      console.log('[web] meta og:description:', bio.slice(0, 100));
    }
    const metaPic = body.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    if (metaPic) {
      profilePic = jsonDecode(metaPic[1]);
      console.log('[web] meta og:image:', profilePic.slice(0, 80));
    }

    // Try to extract hd_profile_pic_url_info from page JSON for higher quality
    const hdPicMatch = body.match(/"hd_profile_pic_url_info":\{[^}]+\}/);
    if (hdPicMatch) {
      try {
        const hdInfo = JSON.parse(hdPicMatch[0].replace(/^[^:]+:/, ''));
        if (hdInfo.url) {
          profilePic = jsonDecode(hdInfo.url);
          console.log('[web] hd_profile_pic_url_info.url:', profilePic.slice(0, 80));
        }
      } catch {}
    }
    // Also try profile_pic_url_hd
    const hdMatch = body.match(/"profile_pic_url_hd":"([^"]+)"/);
    if (hdMatch) {
      profilePic = jsonDecode(hdMatch[1]);
      console.log('[web] profile_pic_url_hd:', profilePic.slice(0, 80));
    }

    // Try to extract bio from the profile page JSON
    const bioMatch = body.match(/"biography":"([^"]+)"/);
    if (bioMatch) {
      bio = jsonDecode(bioMatch[1]);
      console.log('[web] Found biography in page source:', bio.slice(0, 100));
    }
    const extMatch = body.match(/"external_url":"([^"]+)"/);
    if (extMatch) {
      extUrl = jsonDecode(extMatch[1]);
      console.log('[web] Found external_url in page source:', extUrl);
    }
    const fnMatch = body.match(/"full_name":"([^"]+)"/);
    if (fnMatch) {
      fullName = jsonDecode(fnMatch[1]);
      console.log('[web] Found full_name in page source:', fullName);
    }

    if (bio || extUrl || profilePic) {
      const webUserId = loginBody?.userId || '';
      // Serialize cookies manually (request-promise jar doesn't have toJSON)
      const jarCookies = jar.getCookies(baseUrl).map((c: any) => ({
        key: c.key,
        value: c.value,
        expires: c.expires,
        domain: c.domain,
        path: c.path,
      }));
      return {
        user: {
          biography: bio || undefined,
          external_url: extUrl || undefined,
          profile_pic_url: profilePic || undefined,
          hd_profile_pic_url_info: profilePic ? { url: profilePic } : undefined,
          full_name: fullName || undefined,
          username,
        },
        webSession: {
          jarJson: { cookies: jarCookies },
          csrftoken,
          userId: String(webUserId),
        },
      };
    }
  } catch (error: any) {
    console.warn('[web] Error:', error?.message?.slice(0, 200));
  }

  return null;
}

function mergeProfile(base: any, detail: any) {
  return {
    ...base,
    ...detail,
    pk: firstValue(detail.pk, base.pk),
    username: firstValue(detail.username, base.username),
    full_name: firstValue(detail.full_name, base.full_name),
    is_private: firstValue(detail.is_private, base.is_private),
    is_verified: firstValue(detail.is_verified, base.is_verified),
    biography: firstValue(detail.biography, base.biography),
    external_url: firstValue(detail.external_url, base.external_url),
    profile_pic_url: firstValue(detail.profile_pic_url, base.profile_pic_url),
    hd_profile_pic_url_info: firstValue(detail.hd_profile_pic_url_info, base.hd_profile_pic_url_info),
    hd_profile_pic_versions: firstValue(detail.hd_profile_pic_versions, base.hd_profile_pic_versions),
  };
}

function firstValue(primary: any, fallback: any) {
  if (primary !== undefined && primary !== null && primary !== '') {
    return primary;
  }
  return fallback;
}

function toSessionProfile(user: any): SessionProfile {
  const profilePicUrl =
    user.hd_profile_pic_url_info && user.hd_profile_pic_url_info.url
      ? user.hd_profile_pic_url_info.url
      : Array.isArray(user.hd_profile_pic_versions) && user.hd_profile_pic_versions.length > 0
      ? user.hd_profile_pic_versions[user.hd_profile_pic_versions.length - 1].url
      : user.profile_pic_url;

  return {
    id: String(user.pk || ''),
    username: String(user.username || ''),
    fullName: String(user.full_name || ''),
    isPrivate: Boolean(user.is_private),
    isVerified: Boolean(user.is_verified),
    profilePicUrl: profilePicUrl ? String(profilePicUrl) : undefined,
    biography: user.biography ? String(user.biography) : undefined,
    externalUrl: user.external_url ? String(user.external_url) : undefined,
    loginAt: new Date().toISOString(),
  };
}

function createSession(profile: SessionProfile, igState?: any, webSession?: WebSession) {
  const sessionId = randomBytes(24).toString('hex');
  sessions.set(sessionId, { profile, igState, web: webSession });
  return sessionId;
}

function getSessionId(request: IncomingMessage) {
  const cookies = parseCookies(request.headers.cookie || '');
  return cookies[sessionCookieName];
}

function parseCookies(header: string) {
  return header.split(';').reduce((cookies, item) => {
    const index = item.indexOf('=');
    if (index === -1) {
      return cookies;
    }
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {} as { [key: string]: string });
}

function buildSessionCookie(sessionId: string) {
  return `${sessionCookieName}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`;
}

function handleLoginError(error: unknown, response: ServerResponse) {
  if (error instanceof IgLoginTwoFactorRequiredError) {
    const info = error.response.body.two_factor_info;
    const verificationMethod = info.totp_two_factor_on ? '0' : '1';
    sendJson(response, 202, {
      message: `2段階認証が必要です。${verificationMethod === '1' ? 'SMS' : '認証アプリ'}のコードを入力してください。`,
      twoFactorRequired: true,
      twoFactorIdentifier: info.two_factor_identifier,
      verificationMethod,
      username: info.username,
    });
    return;
  }

  if (error instanceof IgLoginBadPasswordError) {
    sendJson(response, 401, { message: 'パスワードが正しくありません。' });
    return;
  }

  if (error instanceof IgLoginInvalidUserError) {
    sendJson(response, 401, { message: 'Instagramアカウントが見つかりません。' });
    return;
  }

  if (error instanceof ClientMessageError) {
    sendJson(response, 400, { message: error.message });
    return;
  }

  if (error instanceof IgResponseError) {
    sendJson(response, error.response.statusCode || 400, {
      message: error.response.body.message || 'Instagramへのログインに失敗しました。',
      errorType: error.response.body.error_type,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Instagramへのログインに失敗しました。';
  sendJson(response, 500, { message });
}

function serveStatic(pathname: string, response: ServerResponse) {
  const filePath = pathname === '/' ? '/instagram-login-page.html' : pathname;
  const resolved = normalize(resolve(root, `.${filePath}`));

  if (!resolved.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  const stream = createReadStream(resolved);
  stream.on('open', () => {
    response.writeHead(200, { 'Content-Type': contentType(resolved), 'Cache-Control': 'no-store' });
    stream.pipe(response);
  });
  stream.on('error', () => {
    response.writeHead(404);
    response.end('Not found');
  });
}

function contentType(filePath: string) {
  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (filePath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }
  return 'application/octet-stream';
}

function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  return new Promise((resolveBody, rejectBody) => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        request.destroy();
        rejectBody(new ClientMessageError('リクエストが大きすぎます。'));
      }
    });
    request.on('end', () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (error) {
        rejectBody(new ClientMessageError('JSON形式のリクエストを送信してください。'));
      }
    });
    request.on('error', rejectBody);
  });
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: object,
  headers: { [key: string]: string | string[] } = {},
) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

class ClientMessageError extends Error {}
