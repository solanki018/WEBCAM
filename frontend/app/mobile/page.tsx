"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import styles from "../device.module.css";

const DEFAULT_SERVER_URL = "https://172.27.126.200:3001";

function getServerUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
  return envUrl && envUrl.trim() ? envUrl.trim() : DEFAULT_SERVER_URL;
}

export default function MobilePage() {
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingModeRef = useRef<"environment" | "user">("environment");

  const [serverUrl] = useState<string>(getServerUrl);
  const [status, setStatus] = useState("Starting camera...");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof RTCPeerConnection !== "function") {
      return undefined;
    }

    const socket = io(serverUrl, {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    const stopStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };

    const cleanupPeer = () => {
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
    };

    const startCamera = async (mode: "environment" | "user") => {
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
        }

        setStatus("Camera ready. Connecting to laptop...");
        setError("");
        return stream;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown camera error";
        setError(message);
        setStatus("Could not access the camera.");
        return null;
      }
    };

    const startWebRtc = async (stream: MediaStream) => {
      cleanupPeer();

      const peer = new RTCPeerConnection({ iceServers: [] });
      peerRef.current = peer;

      stream.getTracks().forEach((track) => {
        peer.addTrack(track, stream);
      });

      peer.onicecandidate = ({ candidate }: RTCPeerConnectionIceEvent) => {
        if (candidate) {
          socket.emit("ice-candidate", candidate);
        }
      };

      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        if (state === "connected") {
          setStatus("Streaming to laptop.");
          setConnected(true);
          setError("");
          return;
        }

        if (state === "failed") {
          setStatus("Connection failed.");
          setConnected(false);
          setError("Peer connection failed.");
          return;
        }

        setStatus(`Connection: ${state}`);
        setConnected(false);
      };

      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit("offer", offer);
        setStatus("Waiting for laptop to answer...");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown WebRTC error";
        setError(message);
        setStatus("Could not create offer.");
      }
    };

    const switchCamera = async () => {
      const nextMode = facingModeRef.current === "environment" ? "user" : "environment";
      facingModeRef.current = nextMode;
      setFacingMode(nextMode);

      const stream = await startCamera(nextMode);
      if (!stream) {
        return;
      }

      const peer = peerRef.current;
      if (!peer) {
        return;
      }

      const sender = peer.getSenders().find((item) => item.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(stream.getVideoTracks()[0] ?? null);
      }
    };

    socket.on("connect", async () => {
      setStatus("Connected to server.");
      setConnected(false);
      const stream = await startCamera(facingModeRef.current);
      if (stream) {
        await startWebRtc(stream);
      }
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

    socket.on("answer", async (answer: RTCSessionDescriptionInit) => {
      const peer = peerRef.current;
      if (!peer) {
        return;
      }

      try {
        await peer.setRemoteDescription(answer);
        setStatus("Laptop connected.");
        setConnected(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown answer error";
        setError(message);
        setStatus("Could not apply laptop answer.");
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

    socket.on("switch-camera", switchCamera);

    return () => {
      cleanupPeer();
      stopStream();
      socket.disconnect();
    };
  }, [serverUrl]);

  const handleSwitchButton = async () => {
    const nextMode = facingModeRef.current === "environment" ? "user" : "environment";
    facingModeRef.current = nextMode;
    setFacingMode(nextMode);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: nextMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Unknown camera error";
      setError(message);
      setStatus("Could not access the camera.");
      return null;
    });

    if (!stream) {
      return;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = stream;

    if (previewRef.current) {
      previewRef.current.srcObject = stream;
    }

    const peer = peerRef.current;
    if (peer) {
      const sender = peer.getSenders().find((item) => item.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(stream.getVideoTracks()[0] ?? null);
      }
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>WifiKit Camera</p>
            <h1 className={styles.title}>Mobile</h1>
          </div>
          <span className={connected ? styles.connected : styles.waiting}>
            {connected ? "Streaming" : "Ready"}
          </span>
        </div>

        <p className={error ? styles.error : styles.status}>{error || status}</p>

        <div className={styles.videoFrame}>
          <video ref={previewRef} autoPlay muted playsInline className={styles.video} />
        </div>

        <div className={styles.controls}>
          <button type="button" onClick={handleSwitchButton} className={styles.button}>
            Switch Camera
          </button>
          <code className={styles.server}>{serverUrl}</code>
        </div>

        <p className={styles.help}>
          Open the laptop route on the viewer device first, then allow camera access
          here to start the stream.
        </p>
      </section>
    </main>
  );
}
