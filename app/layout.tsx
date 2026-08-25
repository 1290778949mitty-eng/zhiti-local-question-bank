import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mitty 的宝藏题库",
  description: "包含深圳中考、深圳自主招生考试和深国交入学考三个数学专门模块。",
  icons: { icon: [{ url: "/favicon.svg?v=mitty", type: "image/svg+xml" }], shortcut: "/favicon.svg?v=mitty" },
};

const themeBootstrapScript = `
  (() => {
    try {
      const savedTheme = window.localStorage.getItem("mitty-color-theme");
      const theme = savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
    } catch {
      document.documentElement.dataset.theme = "light";
    }
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} /></head><body>{children}</body></html>;
}
