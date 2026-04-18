"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import styles from "../device.module.css";

const DEFAULT_SERVER_URL = "https://172.27.126.200:3001";

function getServerUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
  return envUrl && envUrl.trim() ? envUrl.trim() : DEFAULT_SERVER_URL;
}

export default function LaptopPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);

  const [serverUrl] = useState<string>(getServerUrl);
  const [status, setStatus] = useState("Waiting for phone to connect...");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || typeof RTCPeerConnection !== "function") {
      return undefined;
    }

    const socket = io(serverUrl, {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    const cleanupPeer = () => {
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
    };

    socket.on("connect", () => {
      socket.emit("register-laptop");
      setStatus("Connected to server, waiting for phone...");
      setConnected(false);
      setError("");
    });

    socket.on("disconnect", () => {
      cleanupPeer();
      setStatus("Disconnected from server.");
      setConnected(false);
    });

    socket.on("connect_error", (err: Error) => {
      setError(err.message);
      setStatus("Could not connect to the WifiKit server.");
      setConnected(false);
    });

    socket.on("offer", async (offer: RTCSessionDescriptionInit) => {
      cleanupPeer();
      setStatus("Got offer from phone, connecting...");
      setConnected(false);
      setError("");

      try {
        const peer = new RTCPeerConnection({ iceServers: [] });
        peerRef.current = peer;

        peer.ontrack = (event: RTCTrackEvent) => {
          if (videoRef.current) {
            videoRef.current.srcObject = event.streams[0];
          }
          setStatus("Stream received.");
          setConnected(true);
        };

        peer.onicecandidate = ({ candidate }: RTCPeerConnectionIceEvent) => {
          if (candidate) {
            socket.emit("ice-candidate", candidate);
          }
        };

        peer.onconnectionstatechange = () => {
          const state = peer.connectionState;
          setStatus(`Connection: ${state}`);
          setConnected(state === "connected");
          if (state === "failed") {
            setError("Peer connection failed.");
          }
        };

        await peer.setRemoteDescription(offer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("answer", answer);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        setStatus("WebRTC setup failed.");
        setConnected(false);
      }
    });

    socket.on("ice-candidate", async (candidate: RTCIceCandidateInit) => {
      const peer = peerRef.current;
      if (!peer) {
        return;
      }

      try {
        await peer.addIceCandidate(candidate);
      } catch (err) {
        console.error(err);
      }
    });

    return () => {
      cleanupPeer();
      socket.disconnect();
    };
  }, [serverUrl]);

  const handleSwitchCamera = () => {
    if (socketRef.current) {
      socketRef.current.emit("switch-camera");
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>WifiKit Viewer</p>
            <h1 className={styles.title}>Laptop</h1>
          </div>
          <span className={connected ? styles.connected : styles.waiting}>
            {connected ? "Connected" : "Waiting"}
          </span>
        </div>

        <p className={error ? styles.error : styles.status}>{error || status}</p>

        <div className={styles.videoFrame}>
          <video ref={videoRef} autoPlay playsInline className={styles.video} />
        </div>

        <div className={styles.controls}>
          <button type="button" onClick={handleSwitchCamera} className={styles.button}>
            Switch Camera
          </button>
          <code className={styles.server}>{serverUrl}</code>
        </div>

        <p className={styles.help}>
          Trust the backend certificate first, then open the phone route on the
          mobile device to start streaming.
        </p>
      </section>
    </main>
  );
}
