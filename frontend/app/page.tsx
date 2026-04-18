"use client";

import Link from "next/link";
import styles from "./home.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>WifiKit</p>
        <h1 className={styles.title}>Choose your device</h1>
        <p className={styles.subtitle}>
          Pick the mode you want to open, then the app will take you to the right
          route for streaming or viewing.
        </p>

        <div className={styles.grid}>
          <Link href="/laptop" className={styles.card}>
            <span className={styles.cardLabel}>Viewer</span>
            <h2 className={styles.cardTitle}>Laptop</h2>
            <p className={styles.cardText}>
              Watch the live feed, receive the WebRTC stream, and trigger camera
              switching from the larger screen.
            </p>
            <span className={styles.cardAction}>Open laptop route</span>
          </Link>

          <Link href="/mobile" className={styles.card}>
            <span className={styles.cardLabel}>Camera</span>
            <h2 className={styles.cardTitle}>Mobile</h2>
            <p className={styles.cardText}>
              Turn your phone into the video source and send the stream to the
              connected laptop viewer.
            </p>
            <span className={styles.cardAction}>Open mobile route</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
