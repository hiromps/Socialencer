import * as requestPromise from 'request-promise';
import { IgApiClient } from 'instagram-private-api';
import { SessionProfile, WebSession } from './types';

const WEB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function buildSessionProfile(
  ig: IgApiClient,
  loginUser: any,
  password?: string,
): Promise<{ profile: SessionProfile; webSession?: WebSession }> {
  const { details, webSession } = await collectProfileDetails(ig, loginUser, password);
  const mergedProfile = details.reduceRight(
    (profile, detail) => mergeProfile(profile, detail),
    loginUser || {},
  );
  return { profile: toSessionProfile(mergedProfile), webSession };
}

export async function collectProfileDetails(
  ig: IgApiClient,
  loginUser: any,
  password?: string,
): Promise<{ details: any[]; webSession?: WebSession }> {
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

export async function fetchWebProfile(
  loginUser: any,
  username: string,
  password?: string,
): Promise<{ user: any; webSession: WebSession } | null> {
  const rp = requestPromise.defaults({
    headers: {
      'User-Agent': WEB_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/json,*/*',
    },
    gzip: true,
    followRedirect: true,
    simple: false,
    resolveWithFullResponse: true,
  });

  const jar = requestPromise.jar();
  const baseUrl = 'https://www.instagram.com';

  try {
    console.log('[web] Fetching homepage for CSRF token...');
    const homeRes = await rp({ url: baseUrl, jar });
    console.log('[web] Homepage status:', homeRes.statusCode);

    const homeCookies = jar.getCookies(baseUrl);
    const csrfCookie = homeCookies.find((c: any) => c.key === 'csrftoken');
    const csrftoken = csrfCookie ? csrfCookie.value : '';
    console.log('[web] CSRF token from cookie:', csrftoken ? csrftoken.slice(0, 10) + '...' : 'NOT FOUND');

    if (!csrftoken) {
      console.warn('[web] Could not get CSRF token from homepage cookies');
      return null;
    }

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
        Referer: `${baseUrl}/`,
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
    const loginBody =
      typeof loginRes.body === 'string' ? JSON.parse(loginRes.body) : loginRes.body;
    console.log('[web] Login authenticated:', loginBody?.authenticated);

    if (!loginBody?.authenticated) {
      console.warn(
        '[web] Web login failed:',
        loginBody?.message || JSON.stringify(loginBody).slice(0, 200),
      );
      return null;
    }

    console.log('[web] Fetching profile page...');
    const profilePageRes = await rp({
      url: `${baseUrl}/${username}/`,
      jar,
      headers: {
        'X-CSRFToken': csrftoken,
        'X-Instagram-AJAX': '1',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${baseUrl}/`,
      },
    });
    console.log('[web] Profile page status:', profilePageRes.statusCode);

    const body = profilePageRes.body;
    const jsonDecode = (raw: string) => {
      try { return JSON.parse(`"${raw}"`); } catch { return raw; }
    };

    let bio = '';
    let extUrl = '';
    let profilePic = '';
    let fullName = '';

    const metaBio = body.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
    if (metaBio) { bio = jsonDecode(metaBio[1]); }

    const metaPic = body.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    if (metaPic) { profilePic = jsonDecode(metaPic[1]); }

    const hdPicMatch = body.match(/"hd_profile_pic_url_info":\{[^}]+\}/);
    if (hdPicMatch) {
      try {
        const hdInfo = JSON.parse(hdPicMatch[0].replace(/^[^:]+:/, ''));
        if (hdInfo.url) { profilePic = jsonDecode(hdInfo.url); }
      } catch {}
    }

    const hdMatch = body.match(/"profile_pic_url_hd":"([^"]+)"/);
    if (hdMatch) { profilePic = jsonDecode(hdMatch[1]); }

    const bioMatch = body.match(/"biography":"([^"]+)"/);
    if (bioMatch) { bio = jsonDecode(bioMatch[1]); }

    const extMatch = body.match(/"external_url":"([^"]+)"/);
    if (extMatch) { extUrl = jsonDecode(extMatch[1]); }

    const fnMatch = body.match(/"full_name":"([^"]+)"/);
    if (fnMatch) { fullName = jsonDecode(fnMatch[1]); }

    if (bio || extUrl || profilePic) {
      const webUserId = loginBody?.userId || '';
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

export function mergeProfile(base: any, detail: any) {
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
    hd_profile_pic_url_info: firstValue(
      detail.hd_profile_pic_url_info,
      base.hd_profile_pic_url_info,
    ),
    hd_profile_pic_versions: firstValue(
      detail.hd_profile_pic_versions,
      base.hd_profile_pic_versions,
    ),
  };
}

function firstValue(primary: any, fallback: any) {
  if (primary !== undefined && primary !== null && primary !== '') return primary;
  return fallback;
}

export function toSessionProfile(user: any): SessionProfile {
  const profilePicUrl =
    user.hd_profile_pic_url_info && user.hd_profile_pic_url_info.url
      ? user.hd_profile_pic_url_info.url
      : Array.isArray(user.hd_profile_pic_versions) &&
        user.hd_profile_pic_versions.length > 0
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
