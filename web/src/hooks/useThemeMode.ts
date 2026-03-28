import { useEffect, useEffectEvent, useState } from "react";

export type ThemeMode = "dark" | "light";

const getThemeMode = (): ThemeMode => {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
};

export const useThemeMode = (): ThemeMode => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    typeof document === "undefined" ? "light" : getThemeMode(),
  );
  const syncThemeMode = useEffectEvent(() => {
    setThemeMode(getThemeMode());
  });

  useEffect(() => {
    if (typeof document === "undefined") return;

    syncThemeMode();

    const observer = new MutationObserver(() => {
      syncThemeMode();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [syncThemeMode]);

  return themeMode;
};
