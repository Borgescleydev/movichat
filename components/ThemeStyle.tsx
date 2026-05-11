import { prisma } from "@/lib/prisma";
import { DEFAULT_THEME, themeToCSS } from "@/lib/theme";

export default async function ThemeStyle() {
  let css = themeToCSS({});
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: "default" } });
    if (settings?.themeJson) {
      const saved = JSON.parse(settings.themeJson);
      css = themeToCSS({ ...DEFAULT_THEME, ...saved });
    }
  } catch {
    // fallback to defaults
  }

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
