import { SessionProfile } from '@/lib/instagram/types';
import { escapeHtml } from '@/lib/utils/html';
import styles from '@/app/(dashboard)/profile/page.module.css';

export function MetricsRow({
  profile,
  loginDate,
}: {
  profile: SessionProfile;
  loginDate: string;
}) {
  return (
    <>
      <div className={styles.metric}>
        <span>接続状態</span>
        <strong>Active</strong>
      </div>
      <div className={styles.metric}>
        <span>アカウントID</span>
        <strong>{escapeHtml(profile.id || '-')}</strong>
      </div>
      <div className={styles.metric}>
        <span>接続日時</span>
        <strong>{escapeHtml(loginDate)}</strong>
      </div>
    </>
  );
}
