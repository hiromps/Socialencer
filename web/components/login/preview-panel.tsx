import styles from '@/app/(auth)/login/page.module.css';

export function PreviewPanel() {
  return (
    <div className={styles.preview}>
      <div
        className={styles.previewImage}
        style={{
          background:
            'linear-gradient(135deg, #d82972 0%, #f59f00 35%, #2563eb 70%, #0d0d0f 100%)',
        }}
      />
      <div className={styles.previewContent}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span>Socialencer</span>
        </div>
        <h2>
          Instagramアカウントを
          <br />
          接続してダッシュボードを
          <br />
          使い始めましょう
        </h2>
      </div>
    </div>
  );
}
