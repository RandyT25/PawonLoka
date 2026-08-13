import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
export default defineConfig({
  plugins: [react()],
  // Baked in at build time so the running app can show which build it actually is —
  // otherwise there's no way to tell whether a device (especially the packaged Android
  // APK, which only updates on manual reinstall) is running the latest fixes or a stale
  // build from weeks ago.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
