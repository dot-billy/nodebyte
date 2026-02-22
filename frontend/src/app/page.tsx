import { LandingCloud } from "@/components/landing-cloud";
import { LandingOss } from "@/components/landing-oss";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";

async function isRegistrationEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/public-settings`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return true;
    const data = await res.json();
    return data.registration_enabled;
  } catch {
    return true;
  }
}

export default async function Home() {
  const edition = process.env.NEXT_PUBLIC_EDITION ?? "cloud";
  const registrationEnabled = await isRegistrationEnabled();
  return edition === "oss"
    ? <LandingOss registrationEnabled={registrationEnabled} />
    : <LandingCloud registrationEnabled={registrationEnabled} />;
}
