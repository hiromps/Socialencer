import { redirect } from 'next/navigation';
import { getSessionIdFromCookies, getStoredSession } from '@/lib/auth/cookies';
import { ProfileBand } from '@/components/dashboard/profile-band';
import { MetricsRow } from '@/components/dashboard/metrics-row';
import { DetailPanel } from '@/components/dashboard/detail-panel';
import { PostsGrid } from '@/components/dashboard/posts-grid';
import styles from './page.module.css';

export default async function ProfilePage() {
  const sessionId = await getSessionIdFromCookies();
  if (!sessionId) {
    redirect('/login');
  }

  const sessionData = await getStoredSession(sessionId);
  if (!sessionData) {
    redirect('/login');
  }

  const { profile } = sessionData;

  const loginDate = new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(profile.loginAt));

  return (
    <section className={styles.dashboard}>
      <ProfileBand profile={profile} />

      <section className={styles.metrics} aria-label="Account status">
        <MetricsRow
          profile={profile}
          loginDate={loginDate}
        />
      </section>

      <DetailPanel profile={profile} />

      <section className={styles.postsSection} aria-label="Recent posts">
        <div className={styles.postsHeader}>
          <h2>最近の投稿</h2>
          <p>読み込み中</p>
        </div>
        <PostsGrid />
      </section>
    </section>
  );
}
