'use client';

import { useEffect, useState } from 'react';
import { DashboardPost } from '@/lib/instagram/types';
import { escapeHtml } from '@/lib/utils/html';
import styles from '@/app/(dashboard)/profile/page.module.css';

function formatCount(value: number): string {
  return new Intl.NumberFormat('ja-JP', { notation: 'compact' }).format(
    Number(value) || 0,
  );
}

export function PostsGrid() {
  const [posts, setPosts] = useState<DashboardPost[]>([]);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    try {
      const res = await fetch('/api/dashboard/posts', {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        setStatus('error');
        setErrorMessage(data.message || '投稿を読み込めませんでした。');
        return;
      }

      setPosts(data.posts || []);
      setStatus('loaded');

      // Update header
      const headerP = document.querySelector('#postsHeaderStatus');
      if (headerP) {
        headerP.textContent = `${data.posts?.length || 0}件を表示`;
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage('投稿を読み込めませんでした。');
    }
  }

  return (
    <>
      <p id="postsHeaderStatus" hidden aria-live="polite" />

      {status === 'loading' && (
        <p className={styles.postsState}>
          接続済みアカウントの投稿を読み込んでいます。
        </p>
      )}

      {status === 'error' && (
        <p className={styles.postsState}>{escapeHtml(errorMessage)}</p>
      )}

      {status === 'loaded' && posts.length === 0 && (
        <p className={styles.postsState}>
          このアカウントで表示できる投稿はありません。
        </p>
      )}

      {status === 'loaded' && posts.length > 0 && (
        <div className={styles.postsGrid}>
          {posts.map((post) => {
            const caption = (post.caption || '').trim();
            const img = post.thumbnail || post.displayUrl;
            const Wrapper = post.code ? 'a' : 'div';

            return (
              <Wrapper
                key={post.id}
                className={styles.postItem}
                {...(post.code
                  ? {
                      href: `https://www.instagram.com/p/${encodeURIComponent(post.code)}/`,
                      target: '_blank',
                      rel: 'noreferrer',
                    }
                  : {})}
              >
                {img ? (
                  <>
                    <img
                      src={img}
                      alt={caption || 'Instagram post'}
                      loading="lazy"
                    />
                    <div className={styles.postOverlay}>
                      <div className={styles.postCounts}>
                        <span>いいね {formatCount(post.likeCount)}</span>
                        <span>コメント {formatCount(post.commentCount)}</span>
                      </div>
                      <div className={styles.postCaption}>
                        {caption || 'キャプションなし'}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={styles.postOverlay} style={{ opacity: 1 }}>
                    <div className={styles.postCaption}>
                      {caption || '画像を取得できませんでした。'}
                    </div>
                  </div>
                )}
              </Wrapper>
            );
          })}
        </div>
      )}
    </>
  );
}
