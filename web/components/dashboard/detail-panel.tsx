import { SessionProfile } from '@/lib/instagram/types';
import { escapeHtml, escapeAttribute } from '@/lib/utils/html';
import styles from '@/app/(dashboard)/profile/page.module.css';

export function DetailPanel({ profile }: { profile: SessionProfile }) {
  const displayName = profile.fullName || profile.username;
  const biography = profile.biography || 'プロフィール文は設定されていません。';
  const externalUrl = profile.externalUrl || '';

  return (
    <section className={styles.detailPanel} aria-label="Profile details">
      <div className={styles.detailRow}>
        <span>サービス</span>
        <strong>Socialencer</strong>
      </div>
      <div className={styles.detailRow}>
        <span>ユーザー名</span>
        <strong>{escapeHtml(profile.username)}</strong>
      </div>
      <div className={styles.detailRow}>
        <span>表示名</span>
        <strong>{escapeHtml(displayName)}</strong>
      </div>
      <div className={styles.detailRow}>
        <span>プロフィール文</span>
        <strong>{escapeHtml(biography)}</strong>
      </div>
      <div className={styles.detailRow}>
        <span>外部URL</span>
        <strong>
          {externalUrl ? (
            <a
              href={escapeAttribute(externalUrl)}
              target="_blank"
              rel="noreferrer"
            >
              {escapeHtml(externalUrl)}
            </a>
          ) : (
            '未設定'
          )}
        </strong>
      </div>
      <div className={styles.detailRow}>
        <span>プロフィール画像</span>
        <strong>{profile.profilePicUrl ? '取得済み' : '未取得'}</strong>
      </div>
    </section>
  );
}
