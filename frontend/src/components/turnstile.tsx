"use client";

import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileProps {
  siteKey?: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: Array<() => void> = [];

function loadScript() {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) {
    return new Promise<void>((resolve) => {
      loadCallbacks.push(resolve);
    });
  }

  scriptLoading = true;
  return new Promise<void>((resolve) => {
    loadCallbacks.push(resolve);
    window.onTurnstileLoad = () => {
      scriptLoaded = true;
      scriptLoading = false;
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

export function Turnstile({ siteKey, onVerify, onExpire, className }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);

  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  const key = siteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  const renderWidget = useCallback(async () => {
    if (!key || !containerRef.current) return;
    await loadScript();
    if (!window.turnstile || !containerRef.current) return;

    if (widgetIdRef.current) {
      window.turnstile.remove(widgetIdRef.current);
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: key,
      callback: (token: string) => onVerifyRef.current(token),
      "expired-callback": () => onExpireRef.current?.(),
      theme: "auto",
      appearance: "interaction-only",
    });
  }, [key]);

  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  if (!key) return null;

  return <div ref={containerRef} className={className} />;
}
