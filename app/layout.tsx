import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased",
        fontMono.variable,
        "font-sans",
        fontSans.variable
      )}
    >
      <body className="h-full overflow-hidden">
        <ThemeProvider>
          <TooltipProvider>
            <div
              className="flex h-full min-h-0 flex-col overflow-hidden"
              style={{ height: "var(--forge-viewport-height, 100dvh)" }}
            >
              {children}
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
