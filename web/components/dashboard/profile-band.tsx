import { SessionProfile } from '@/lib/instagram/types';
import { escapeHtml } from '@/lib/utils/html';
import styles from '@/app/(dashboard)/profile/page.module.css';

export function ProfileBand({ profile }: { profile: SessionProfile }) {
  const displayName = profile.fullName || profile.username;
  const biography = profile.biography || 'プロフィール文は設定されていません。';
  const avatar = profile.profilePicUrl ? (
    <img
      src={profile.profilePicUrl}
      alt={displayName}
    />
  ) : (
    profile.username.slice(0, 1).toUpperCase()
  );

  return (
    <section className={styles.profileBand}>
      <div className={styles.avatar}>{avatar}</div>
      <div className={styles.identity}>
        <h2>{escapeHtml(displayName)}</h2>
        <p className={styles.handle}>@{escapeHtml(profile.username)}</p>
        <p className={styles.bio}>{escapeHtml(biography)}</p>
        <div className={styles.badges}>
          <span className={`${styles.badge} ${styles.badgeGreen}`}>
            接続済み
          </span>
          <span className={styles.badge}>
            {profile.isPrivate ? '非公開アカウント' : '公開アカウント'}
          </span>
          <span className={styles.badge}>
            {profile.isVerified ? '認証済み' : '未認証'}
          </span>
        </div>
      </div>
      <a
        className={styles.quickLink}
        href={`https://www.instagram.com/${encodeURIComponent(profile.username)}/`}
        target="_blank"
        rel="noreferrer"
      >
        Instagramで開く
      </a>
    </section>
  );
}
