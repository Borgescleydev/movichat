/** Parse user-agent string into browser, OS and device type */
export function parseUserAgent(ua: string): { browser: string; os: string; deviceType: string } {
  if (!ua) return { browser: "Desconhecido", os: "Desconhecido", deviceType: "desktop" };

  // Device type
  const isMobile = /Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet = /iPad|Tablet|PlayBook/i.test(ua);
  const deviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  // Browser
  let browser = "Desconhecido";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\/[0-9]/i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\/[0-9]/i.test(ua)) browser = "Firefox";
  else if (/Safari\/[0-9]/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/MSIE|Trident/i.test(ua)) browser = "Internet Explorer";
  else if (/curl/i.test(ua)) browser = "curl";

  // Get browser version
  const versionMap: Record<string, RegExp> = {
    Edge: /Edg\/([0-9]+)/i,
    Chrome: /Chrome\/([0-9]+)/i,
    Firefox: /Firefox\/([0-9]+)/i,
    Safari: /Version\/([0-9]+)/i,
    Opera: /OPR\/([0-9]+)/i,
  };
  const versionRe = versionMap[browser];
  if (versionRe) {
    const m = ua.match(versionRe);
    if (m) browser = `${browser} ${m[1]}`;
  }

  // OS
  let os = "Desconhecido";
  if (/Windows NT 10/i.test(ua)) os = "Windows 10/11";
  else if (/Windows NT 6\.3/i.test(ua)) os = "Windows 8.1";
  else if (/Windows NT 6\.1/i.test(ua)) os = "Windows 7";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X ([0-9_]+)/i.test(ua)) {
    const m = ua.match(/Mac OS X ([0-9_]+)/i);
    os = m ? `macOS ${m[1].replace(/_/g, ".")}` : "macOS";
  }
  else if (/iPhone OS ([0-9_]+)/i.test(ua)) {
    const m = ua.match(/iPhone OS ([0-9_]+)/i);
    os = m ? `iOS ${m[1].replace(/_/g, ".")}` : "iOS";
  }
  else if (/iPad.*OS ([0-9_]+)/i.test(ua)) {
    const m = ua.match(/iPad.*OS ([0-9_]+)/i);
    os = m ? `iPadOS ${m[1].replace(/_/g, ".")}` : "iPadOS";
  }
  else if (/Android ([0-9.]+)/i.test(ua)) {
    const m = ua.match(/Android ([0-9.]+)/i);
    os = m ? `Android ${m[1]}` : "Android";
  }
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/CrOS/i.test(ua)) os = "Chrome OS";

  return { browser, os, deviceType };
}

/** Look up geolocation for an IP. Returns country/city/region or nulls on failure. */
export async function geolocateIp(ip: string): Promise<{ country: string | null; city: string | null; region: string | null }> {
  // Skip for local/private IPs
  if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.")) {
    return { country: "Local", city: null, region: null };
  }

  try {
    const res = await fetch(`https://ip-api.com/json/${ip}?fields=status,country,regionName,city`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { country: null, city: null, region: null };
    const data = await res.json() as { status: string; country?: string; regionName?: string; city?: string };
    if (data.status !== "success") return { country: null, city: null, region: null };
    return { country: data.country || null, city: data.city || null, region: data.regionName || null };
  } catch {
    return { country: null, city: null, region: null };
  }
}

/** Extract real IP from request headers (handles proxies/Vercel). */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  return (
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}
