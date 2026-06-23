import { DashboardPost } from './types';
import { JSONbigIntParse } from '@/lib/utils/json-bigint';

/**
 * Extracts post data from an Instagram profile page's embedded JSON.
 *
 * Instagram profile pages embed a JSON object containing
 * `edge_owner_to_timeline_media` whose `edges[].node` records map to
 * individual posts. This function locates that JSON block in the raw HTML
 * via brace-counting (not regex), so it tolerates deeply nested structures.
 */
export function extractPostsFromProfileHtml(html: string): DashboardPost[] {
  const mediaEdges = extractMediaEdges(html, '"edge_owner_to_timeline_media":');
  if (mediaEdges.length) return mediaEdges;

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
  if (Array.isArray(obj.edges)) {
    const hasShortcode = obj.edges.some(
      (e: any) => (e?.node?.shortcode || e?.node?.code || e?.shortcode),
    );
    if (hasShortcode) {
      return obj.edges.map((e: any) => toDashboardPost(e.node || e));
    }
  }
  for (const value of Object.values(obj)) {
    const result = findEdgesRecursive(value, depth + 1);
    if (result.length) return result;
  }
  return [];
}

export function toDashboardPost(item: any): DashboardPost {
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
    candidates.length > 1
      ? candidates[1]?.url || candidates[0]?.url
      : candidates[0]?.url ||
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
